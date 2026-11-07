const fs = require('fs');

const file = 'apps/web/components/WebinarForm.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Ensure import from @webinar/shared
if (!content.includes('DEFAULT_REGISTRATION_FIELDS')) {
  content = content.replace(
    "import { Button, Input, Textarea, Switch } from '@/components/ui';",
    "import { Button, Input, Textarea, Switch } from '@/components/ui';\nimport { DEFAULT_REGISTRATION_FIELDS, type RegistrationFieldsConfig, type StandardRegistrationField } from '@webinar/shared';"
  );
}

// 2. Add registrationFields to WebinarFormValues
if (!content.includes('registrationFields: RegistrationFieldsConfig;')) {
  content = content.replace(
    'requirePhone: boolean;\r\n}',
    'requirePhone: boolean;\r\n  registrationFields: RegistrationFieldsConfig;\r\n}'
  );
  if (!content.includes('registrationFields: RegistrationFieldsConfig;')) {
    content = content.replace(
      'requirePhone: boolean;\n}',
      'requirePhone: boolean;\n  registrationFields: RegistrationFieldsConfig;\n}'
    );
  }
}

// 3. Add to emptyWebinar
if (!content.includes('registrationFields: DEFAULT_REGISTRATION_FIELDS,')) {
  content = content.replace(
    'requirePhone: true,\r\n};',
    'requirePhone: true,\r\n  registrationFields: DEFAULT_REGISTRATION_FIELDS,\r\n};'
  );
  if (!content.includes('registrationFields: DEFAULT_REGISTRATION_FIELDS,')) {
    content = content.replace(
      'requirePhone: true,\n};',
      'requirePhone: true,\n  registrationFields: DEFAULT_REGISTRATION_FIELDS,\n};'
    );
  }
}

// 4. Add to fromWebinar
if (!content.includes('registrationFields: regFields,')) {
  const fromTarget = `    whatsappGroupUrl: typeof s.whatsappGroupUrl === 'string' ? s.whatsappGroupUrl : '',
    collectPhone: s.collectPhone !== false,
    requirePhone: s.requirePhone !== false,
  };`;

  const fromReplacement = `    whatsappGroupUrl: typeof s.whatsappGroupUrl === 'string' ? s.whatsappGroupUrl : '',
    collectPhone: s.collectPhone !== false,
    requirePhone: s.requirePhone !== false,
    registrationFields: (s.registrationFields as RegistrationFieldsConfig) || {
      name: { enabled: true, label: 'Full Name', placeholder: 'e.g. Ada Lovelace', required: true },
      email: { enabled: true, label: 'Email Address', placeholder: 'you@company.com', required: true },
      phone: { enabled: s.collectPhone !== false, label: 'Mobile Number', placeholder: '+91 98765 43210', required: s.requirePhone !== false },
    },
  };`;

  content = content.replace(fromTarget, fromReplacement);
  if (!content.includes('registrationFields: (s.registrationFields as RegistrationFieldsConfig)')) {
    const fromTargetLF = fromTarget.replace(/\r\n/g, '\n');
    const fromReplacementLF = fromReplacement.replace(/\r\n/g, '\n');
    content = content.replace(fromTargetLF, fromReplacementLF);
  }
}

// 5. Replace the Form Fields section in UI with the fully customizable editor
const oldUIBlockRegex = /\{\/\* Standard Fields Configuration \*\/\}[\s\S]*?\{\/\* Custom Registration Fields Editor \*\/\}/;

const newUIBlock = `{/* Standard Fields Configuration - Fully Customizable */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-fg">Registration Form Fields</p>
                  <p className="text-[11px] text-muted">
                    Edit labels, customize placeholders, set mandatory/optional status, or delete any field
                  </p>
                </div>
              </div>

              {/* Editable Fields List */}
              <div className="space-y-2.5">
                {[
                  { key: 'name' as const, type: 'Short Text', icon: '👤', fallbackLabel: 'Full Name', fallbackPlaceholder: 'e.g. Ada Lovelace' },
                  { key: 'email' as const, type: 'Email Address', icon: '✉️', fallbackLabel: 'Email Address', fallbackPlaceholder: 'you@company.com' },
                  { key: 'phone' as const, type: 'Mobile Phone', icon: '📱', fallbackLabel: 'Mobile Number', fallbackPlaceholder: '+91 98765 43210' },
                ].map((def) => {
                  const field = v.registrationFields?.[def.key] ?? {
                    enabled: def.key !== 'phone' ? true : v.collectPhone,
                    label: def.fallbackLabel,
                    placeholder: def.fallbackPlaceholder,
                    required: def.key !== 'phone' ? true : v.requirePhone,
                  };

                  if (!field.enabled) return null;

                  const isEditing = editingFieldKey === def.key;

                  return (
                    <div
                      key={def.key}
                      className="rounded-xl border border-line bg-panel/80 p-3 sm:p-3.5 space-y-3 shadow-sm hover:border-line-hover transition"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="grid h-6 w-6 place-items-center rounded-lg bg-panel-2 text-xs">
                            {def.icon}
                          </span>
                          <div>
                            <p className="truncate text-xs font-bold text-fg flex items-center gap-1.5">
                              <span>{field.label || def.fallbackLabel}</span>
                              {field.required ? (
                                <span className="text-red-500 font-bold">*</span>
                              ) : (
                                <span className="text-[10px] font-normal text-muted">(Optional)</span>
                              )}
                            </p>
                            <p className="text-[10px] text-muted">
                              {def.type} • {field.required ? 'Mandatory Field' : 'Optional Field'}
                            </p>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1.5">
                          {/* Toggle Required Button */}
                          <button
                            type="button"
                            onClick={() => {
                              const nextRequired = !field.required;
                              const updated = {
                                ...v.registrationFields,
                                [def.key]: { ...field, required: nextRequired },
                              };
                              set('registrationFields', updated);
                              if (def.key === 'phone') set('requirePhone', nextRequired);
                            }}
                            className={\`px-2.5 py-1 rounded-lg text-[11px] font-bold transition border \${
                              field.required
                                ? 'bg-mint-500/15 text-mint-500 border-mint-500/30 hover:bg-mint-500/25'
                                : 'bg-amber-500/15 text-amber-500 border-amber-500/30 hover:bg-amber-500/25'
                            }\`}
                          >
                            {field.required ? '★ Mandatory' : '○ Optional'}
                          </button>

                          {/* Edit Details Toggle */}
                          <button
                            type="button"
                            onClick={() => setEditingFieldKey(isEditing ? null : def.key)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-fg bg-panel hover:bg-line transition border border-line"
                          >
                            {isEditing ? 'Done' : '✏️ Edit'}
                          </button>

                          {/* Delete Field Button */}
                          <button
                            type="button"
                            onClick={() => {
                              const updated = {
                                ...v.registrationFields,
                                [def.key]: { ...field, enabled: false },
                              };
                              set('registrationFields', updated);
                              if (def.key === 'phone') set('collectPhone', false);
                            }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-red-500 hover:bg-red-500/15 transition border border-red-500/20"
                            title={\`Delete \${field.label} from registration\`}
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>

                      {/* Edit Inputs Block */}
                      {isEditing && (
                        <div className="grid gap-2.5 sm:grid-cols-2 pt-2 border-t border-line/60 animate-fade-up">
                          <div>
                            <label className="block text-[11px] font-semibold text-muted mb-1">
                              Field Display Label
                            </label>
                            <input
                              type="text"
                              value={field.label}
                              onChange={(e) => {
                                const updated = {
                                  ...v.registrationFields,
                                  [def.key]: { ...field, label: e.target.value },
                                };
                                set('registrationFields', updated);
                              }}
                              placeholder={def.fallbackLabel}
                              className="w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-fg focus:border-brand-500 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-muted mb-1">
                              Input Placeholder Text
                            </label>
                            <input
                              type="text"
                              value={field.placeholder ?? ''}
                              onChange={(e) => {
                                const updated = {
                                  ...v.registrationFields,
                                  [def.key]: { ...field, placeholder: e.target.value },
                                };
                                set('registrationFields', updated);
                              }}
                              placeholder={def.fallbackPlaceholder}
                              className="w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-fg focus:border-brand-500 focus:outline-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Restore Deleted Fields Banner (if any field is disabled) */}
                {(() => {
                  const deletedKeys = (['name', 'email', 'phone'] as const).filter((k) => {
                    const f = v.registrationFields?.[k];
                    return f && f.enabled === false;
                  });

                  if (deletedKeys.length === 0) return null;

                  const labelMap = { name: 'Full Name', email: 'Email Address', phone: 'Mobile Number' };

                  return (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line bg-panel/40 p-2.5 text-xs">
                      <span className="text-muted text-[11px]">Deleted fields:</span>
                      {deletedKeys.map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => {
                            const cur = v.registrationFields?.[k];
                            const updated = {
                              ...v.registrationFields,
                              [k]: {
                                ...cur,
                                enabled: true,
                                label: cur?.label || labelMap[k],
                                placeholder: cur?.placeholder || '',
                                required: true,
                              },
                            };
                            set('registrationFields', updated);
                            if (k === 'phone') {
                              set('collectPhone', true);
                              set('requirePhone', true);
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-brand-500/30 bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-500/20 transition"
                        >
                          <span>+ Restore {labelMap[k]}</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Custom Registration Fields Editor */}`;

content = content.replace(oldUIBlockRegex, newUIBlock);

// Add editingFieldKey state inside WebinarForm component
if (!content.includes('const [editingFieldKey, setEditingFieldKey]')) {
  content = content.replace(
    'const [uploadingBanner, setUploadingBanner] = useState(false);',
    'const [uploadingBanner, setUploadingBanner] = useState(false);\n  const [editingFieldKey, setEditingFieldKey] = useState<\'name\' | \'email\' | \'phone\' | null>(null);'
  );
}

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully updated WebinarForm.tsx with customizable fields editor');

