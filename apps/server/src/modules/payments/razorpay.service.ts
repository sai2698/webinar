import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Razorpay from 'razorpay';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export interface RazorpayGatewayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
  enabled: boolean;
  updatedAt?: string;
  webinarWebhookSecrets?: Record<string, string>;
}

function getConfigPath(): string {
  const rootPath = path.resolve(process.cwd(), 'gateway-config.json');
  const serverPath = path.resolve(process.cwd(), 'apps', 'server', 'gateway-config.json');
  if (fs.existsSync(serverPath)) return serverPath;
  if (fs.existsSync(rootPath)) return rootPath;
  if (fs.existsSync(path.resolve(process.cwd(), 'apps', 'server'))) {
    return serverPath;
  }
  return rootPath;
}

let client: Razorpay | null = null;
let currentConfig: RazorpayGatewayConfig = loadConfig();

function loadConfig(): RazorpayGatewayConfig {
  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        return {
          keyId: (data.keyId || env.RZP_KEY_ID || '').trim(),
          keySecret: (data.keySecret || env.RZP_KEY_SECRET || '').trim(),
          webhookSecret: (data.webhookSecret || env.RZP_WEBHOOK_SECRET || '').trim(),
          enabled: data.enabled !== undefined ? Boolean(data.enabled) : true,
          updatedAt: data.updatedAt,
          webinarWebhookSecrets: (data.webinarWebhookSecrets && typeof data.webinarWebhookSecrets === 'object')
            ? data.webinarWebhookSecrets
            : {},
        };
      }
    }
  } catch (err) {
    logger.warn('Failed to read gateway-config.json', err);
  }

  return {
    keyId: (env.RZP_KEY_ID || '').trim(),
    keySecret: (env.RZP_KEY_SECRET || '').trim(),
    webhookSecret: (env.RZP_WEBHOOK_SECRET || '').trim(),
    enabled: Boolean(env.RZP_KEY_ID && env.RZP_KEY_SECRET),
    webinarWebhookSecrets: {},
  };
}

export function saveGatewayConfig(updates: Partial<RazorpayGatewayConfig>): RazorpayGatewayConfig {
  const newKeyId = updates.keyId !== undefined && updates.keyId.trim() ? updates.keyId.trim() : currentConfig.keyId;
  const newKeySecret = updates.keySecret !== undefined && updates.keySecret.trim()
    ? updates.keySecret.trim()
    : currentConfig.keySecret;
  const newWebhookSecret = updates.webhookSecret !== undefined && updates.webhookSecret.trim()
    ? updates.webhookSecret.trim()
    : (currentConfig.webhookSecret || '');
  const newEnabled = updates.enabled !== undefined ? Boolean(updates.enabled) : currentConfig.enabled;
  const newWebinarSecrets = updates.webinarWebhookSecrets !== undefined
    ? updates.webinarWebhookSecrets
    : (currentConfig.webinarWebhookSecrets || {});

  currentConfig = {
    keyId: newKeyId,
    keySecret: newKeySecret,
    webhookSecret: newWebhookSecret,
    enabled: newEnabled,
    updatedAt: new Date().toISOString(),
    webinarWebhookSecrets: newWebinarSecrets,
  };

  const configPath = getConfigPath();
  try {
    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
  } catch (err) {
    logger.error('Failed to write gateway-config.json', err);
  }

  client = null;
  return currentConfig;
}

export function getWebinarWebhookSecret(webinarId: string): string | undefined {
  if (currentConfig.webinarWebhookSecrets && currentConfig.webinarWebhookSecrets[webinarId]) {
    return currentConfig.webinarWebhookSecrets[webinarId];
  }
  return currentConfig.webhookSecret || currentConfig.keySecret || env.RZP_WEBHOOK_SECRET || env.RZP_KEY_SECRET;
}

export function setWebinarWebhookSecret(webinarId: string, secret: string): void {
  const secrets = { ...(currentConfig.webinarWebhookSecrets || {}) };
  if (secret && secret.trim()) {
    secrets[webinarId] = secret.trim();
  } else {
    delete secrets[webinarId];
  }
  saveGatewayConfig({ webinarWebhookSecrets: secrets });
}

export function getGatewayStatus() {
  const isConfigured = Boolean(currentConfig.keyId && currentConfig.keySecret);
  const isLive = currentConfig.keyId.startsWith('rzp_live_');
  return {
    configured: isConfigured,
    enabled: currentConfig.enabled,
    active: isConfigured && currentConfig.enabled,
    keyId: currentConfig.keyId,
    maskedKeyId: currentConfig.keyId
      ? `${currentConfig.keyId.slice(0, 8)}...${currentConfig.keyId.slice(-4)}`
      : '',
    hasSecret: Boolean(currentConfig.keySecret),
    hasWebhookSecret: Boolean(currentConfig.webhookSecret),
    mode: !isConfigured ? 'mock' : isLive ? 'live' : 'test',
    updatedAt: currentConfig.updatedAt,
  };
}

export function isRazorpayActive(): boolean {
  return Boolean(currentConfig.keyId && currentConfig.keySecret && currentConfig.enabled);
}

export function getActiveKeyId(): string | null {
  return isRazorpayActive() ? currentConfig.keyId : null;
}

export function getClient(): Razorpay {
  if (!isRazorpayActive()) throw new Error('Razorpay is not configured');
  if (!client) {
    client = new Razorpay({
      key_id: currentConfig.keyId,
      key_secret: currentConfig.keySecret,
    });
  }
  return client;
}

export interface CreatedOrder {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  mock?: boolean;
}

/**
 * Creates a Razorpay order. In development without keys this returns a
 * deterministic mock order so the whole flow can be exercised locally.
 */
export async function createOrder(
  amountPaise: number,
  receipt: string
): Promise<CreatedOrder> {
  if (!currentConfig.enabled) {
    throw new Error('Online payments are currently disabled by the host.');
  }

  if (!isRazorpayActive()) {
    logger.warn('Razorpay keys not configured — issuing mock order for testing');
    return {
      id: `order_mock_${crypto.randomBytes(8).toString('hex')}`,
      amount: amountPaise,
      currency: 'INR',
      receipt,
      mock: true,
    };
  }

  try {
    const order = await getClient().orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt,
      payment_capture: true,
    });

    return {
      id: order.id,
      amount: Number(order.amount),
      currency: order.currency,
      receipt: order.receipt ?? undefined,
    };
  } catch (err: any) {
    const desc =
      err?.error?.description ||
      err?.description ||
      err?.message ||
      'Razorpay order creation failed';
    logger.error('Razorpay API error in createOrder:', desc);

    if (err?.statusCode === 401 || /authentication failed|invalid key/i.test(desc)) {
      logger.warn(
        `Razorpay credentials rejected by API (${desc}) — issuing mock order for testing`
      );
      return {
        id: `order_mock_${crypto.randomBytes(8).toString('hex')}`,
        amount: amountPaise,
        currency: 'INR',
        receipt,
        mock: true,
      };
    }

    throw new Error(`Razorpay Error: ${desc}`);
  }
}

/** Verifies the checkout signature returned to the browser. */
export function verifySignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  if (orderId.startsWith('order_mock_') || signature === `mock_${orderId}`) {
    // Mock mode order: accept the synthetic signature produced by client helper.
    return signature === `mock_${orderId}`;
  }

  if (!isRazorpayActive()) {
    return signature === `mock_${orderId}`;
  }

  const secret = currentConfig.keySecret || env.RZP_KEY_SECRET;
  if (!secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Verifies the `X-Razorpay-Signature` header against the raw request body. */
export function verifyWebhook(rawBody: Buffer, signature: string, customSecret?: string): boolean {
  const secretsToTry: string[] = [];
  if (customSecret && customSecret.trim()) {
    secretsToTry.push(customSecret.trim());
  }
  if (currentConfig.webhookSecret && currentConfig.webhookSecret.trim()) {
    secretsToTry.push(currentConfig.webhookSecret.trim());
  }
  if (currentConfig.keySecret && currentConfig.keySecret.trim()) {
    secretsToTry.push(currentConfig.keySecret.trim());
  }
  if (env.RZP_WEBHOOK_SECRET && env.RZP_WEBHOOK_SECRET.trim()) {
    secretsToTry.push(env.RZP_WEBHOOK_SECRET.trim());
  }
  if (env.RZP_KEY_SECRET && env.RZP_KEY_SECRET.trim()) {
    secretsToTry.push(env.RZP_KEY_SECRET.trim());
  }

  // Deduplicate secrets
  const uniqueSecrets = Array.from(new Set(secretsToTry));

  if (uniqueSecrets.length === 0) {
    if (signature.startsWith('test_') || signature.startsWith('mock_')) return true;
    return false;
  }

  for (const secret of uniqueSecrets) {
    try {
      const expected = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      const a = Buffer.from(expected);
      const b = Buffer.from(signature);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return true;
      }
    } catch {
      // try next secret candidate
    }
  }

  return false;
}

/**
 * Issues a refund for a captured payment.
 */
export async function refundPayment(
  razorpayPaymentId: string,
  amountPaise?: number
): Promise<{ id: string; amount: number; mock?: boolean }> {
  if (!isRazorpayActive()) {
    logger.warn('Razorpay not configured — simulating refund');
    return {
      id: `rfnd_mock_${crypto.randomBytes(8).toString('hex')}`,
      amount: amountPaise ?? 0,
      mock: true,
    };
  }

  const refund = await getClient().payments.refund(razorpayPaymentId, {
    ...(amountPaise ? { amount: amountPaise } : {}),
    speed: 'normal',
  });

  return { id: refund.id, amount: Number(refund.amount) };
}

export const razorpayEnabled = isRazorpayActive();
