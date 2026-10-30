import { Router } from 'express';
import { prisma } from '../../db/prisma.js';
import { verifyWebhook, getWebinarWebhookSecret } from './razorpay.service.js';
import { fulfilPayment } from './routes.js';
import { logger } from '../../utils/logger.js';

export const webhookRouter = Router();

/**
 * Razorpay Webhook Handler
 *
 * Supports both dedicated webinar webhooks (/api/payments/webhook/:webinarId)
 * and global webhooks (/api/payments/webhook).
 *
 * Mounted with express.raw({ type: 'application/json' or wildcard }) so the HMAC-SHA256 signature
 * can be verified over the exact raw bytes Razorpay sent using the Key Secret or webinar webhook secret.
 */
async function handleWebhookRequest(req: any, res: any, targetWebinarId?: string) {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.body as Buffer;

  if (typeof signature !== 'string' || !Buffer.isBuffer(rawBody)) {
    res.status(400).json({ error: 'Invalid webhook request: missing signature or raw body' });
    return;
  }

  const customSecret = targetWebinarId ? getWebinarWebhookSecret(targetWebinarId) : undefined;

  if (!verifyWebhook(rawBody, signature, customSecret)) {
    logger.warn(`Webhook signature mismatch for webinar: ${targetWebinarId || 'global'}`);
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  let event: any;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.status(400).json({ error: 'Malformed JSON payload' });
    return;
  }

  logger.info(`Received Razorpay webhook: ${event.event} for webinar: ${targetWebinarId || 'unspecified'}`);

  const paymentEntity = event.payload?.payment?.entity;
  const orderEntity = event.payload?.order?.entity;
  const orderId = paymentEntity?.order_id || orderEntity?.id;
  const paymentId = paymentEntity?.id;
  const amountPaise = paymentEntity?.amount || orderEntity?.amount || 0;
  const notes = paymentEntity?.notes || orderEntity?.notes || {};
  const email = paymentEntity?.email;
  const contact = paymentEntity?.contact;
  const name = notes.name || notes.userName || (email ? email.split('@')[0] : 'Attendee');

  // Webinar ID can come from URL parameter, query, or Razorpay notes
  const effectiveWebinarId = targetWebinarId || notes.webinarId || notes.webinar_id;

  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    let payment = orderId
      ? await prisma.payment.findUnique({ where: { razorpayOrderId: orderId } })
      : null;

    if (!payment && paymentId) {
      payment = await prisma.payment.findFirst({ where: { razorpayPaymentId: paymentId } });
    }

    if (payment) {
      if (!payment.webinarId && effectiveWebinarId) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { webinarId: effectiveWebinarId },
        });
      }
      await fulfilPayment(payment.id, paymentId || `pay_${Date.now()}`);
      logger.info(`Webhook fulfilled existing payment ${payment.id}`);
    } else if (effectiveWebinarId && amountPaise > 0) {
      // Payment arrived via webhook without prior in-app order creation
      let user = email ? await prisma.user.findUnique({ where: { email } }) : null;
      if (!user) {
        user = await prisma.user.create({
          data: {
            email: email || `guest_${Date.now()}@example.com`,
            name: name || 'Guest Attendee',
            role: 'PARTICIPANT',
          },
        });
      }

      // Find offer for this webinar
      const cta = await prisma.cta.findFirst({
        where: { webinarId: effectiveWebinarId },
      });

      const newPayment = await prisma.payment.create({
        data: {
          userId: user.id,
          webinarId: effectiveWebinarId,
          ctaId: cta?.id ?? null,
          courseId: cta?.courseId ?? null,
          razorpayOrderId: orderId || `order_${paymentId || Date.now()}`,
          razorpayPaymentId: paymentId || `pay_${Date.now()}`,
          amountPaise,
          status: 'CREATED',
        },
      });

      await fulfilPayment(newPayment.id, paymentId || newPayment.razorpayPaymentId!);
      logger.info(`Webhook created and fulfilled payment ${newPayment.id} for webinar ${effectiveWebinarId}`);
    } else {
      logger.warn(`Webhook received for untracked order: ${orderId}`);
    }
  } else if (event.event === 'payment.failed') {
    if (orderId) {
      await prisma.payment.updateMany({
        where: { razorpayOrderId: orderId },
        data: { status: 'FAILED' },
      });
    }
  } else if (event.event === 'refund.processed') {
    if (paymentId) {
      await prisma.payment.updateMany({
        where: { razorpayPaymentId: paymentId },
        data: { status: 'REFUNDED' },
      });
    }
  }

  // Always 200 so Razorpay stops retrying
  res.json({
    received: true,
    webinarId: effectiveWebinarId,
    event: event.event,
  });
}

/** Dedicated webhook URL for a specific webinar */
webhookRouter.post('/:webinarId', async (req, res) => {
  return handleWebhookRequest(req, res, req.params.webinarId);
});

/** Global fallback webhook */
webhookRouter.post('/', async (req, res) => {
  const webinarId = req.query.webinarId ? String(req.query.webinarId) : undefined;
  return handleWebhookRequest(req, res, webinarId);
});
