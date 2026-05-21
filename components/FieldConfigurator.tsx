"use client";

import { useMemo, useState } from 'react';
import { FieldConfig, GradientValue, SelectOptionConfig, defaultGradientValue, getSelectDefaultValue, getSelectOptions } from '@/lib/template-parser';
import ColorPicker from '@/components/ColorPicker';

interface ConfiguratorProps {
    field: FieldConfig;
    onSave: (updated: FieldConfig) => void;
    onCancel: () => void;
}

const defaultSlider = { label: 'Value', min: 0, max: 100, step: 1, unit: 'px', default_value: 0 };

const inputClass = "font-Google-Sans bg-black/20 border border-(--primary)/50 p-2 outline-none text-sm focus:border-(--primary)/75 transition-all duration-300";
const compactInputClass = "bg-black/40 border border-(--primary)/30 p-1 text-xs outline-none focus:border-(--primary)";

export default function FieldConfigurator({ field, onSave, onCancel }: ConfiguratorProps) {
    const [tempField, setTempField] = useState<FieldConfig>({ ...field });

    const selectOptions = useMemo(() => getSelectOptions(tempField), [tempField]);

    const updateField = (patch: Partial<FieldConfig>) => {
        setTempField(prev => ({ ...prev, ...patch }));
    };

    const saveSelectOptions = (options: SelectOptionConfig[]) => {
        const normalized: SelectOptionConfig[] = options.map(opt => ({
            option: opt.option,
            value: opt.value,
            type: opt.type || '',
            default_value: opt.default_value || '',
            has_format: opt.has_format || false,
            format: opt.format || '',
        }));
        const nextField = {
            ...tempField,
            options: '',
            config: { ...tempField.config, select_options: normalized },
        };
        const nextDefault = getSelectDefaultValue(nextField);

        setTempField({
            ...nextField,
            default_value: nextDefault,
            placeholder: nextDefault,
        });
    };

    return (
        <div className="text-sm space-y-6">
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase opacity-60">Display_Label</label>
                        <input
                            type="text"
                            value={tempField.label}
                            onChange={(e) => updateField({ label: e.target.value })}
                            className={inputClass}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase opacity-60">Input_Type</label>
                        <select
                            value={tempField.type}
                            onChange={(e) => updateField({ type: e.target.value as FieldConfig['type'] })}
                            className={`${inputClass} text-(--primary) appearance-none cursor-pointer`}
                        >
                            <option value="text" className="bg-black">Text</option>
                            <option value="bbcode" className="bg-black">BB Code</option>
                            <option value="color" className="bg-black">Color</option>
                            <option value="select" className="bg-black">Select Menu</option>
                            <option value="slider" className="bg-black">Slider</option>
                            <option value="checkbox" className="bg-black">Check Box</option>
                            <option value="gradient" className="bg-black">Gradient</option>
                        </select>
                    </div>
                </div>

                {tempField.type === 'color' && (
                    <ColorConfig field={tempField} onChange={setTempField} />
                )}

                {tempField.type === 'select' && (
                    <SelectConfig
                        field={tempField}
                        options={selectOptions.length ? selectOptions : [{ option: 'Option', value: 'Value', type: '' }]}
                        onOptionsChange={saveSelectOptions}
                        onFieldChange={setTempField}
                    />
                )}

                {tempField.type === 'slider' && (
                    <SliderConfig field={tempField} onChange={setTempField} />
                )}

                {tempField.type === 'gradient' && (
                    <GradientConfig field={tempField} onChange={setTempField} />
                )}

                {tempField.type === 'checkbox' && (
                    <CheckboxConfig field={tempField} onChange={setTempField} />
                )}

                {tempField.type !== 'color' &&
                tempField.type !== 'select' &&
                tempField.type !== 'slider' &&
                tempField.type !== 'gradient' &&
                tempField.type !== 'checkbox' && (
                    <DefaultValueConfig field={tempField} onChange={setTempField} />
                )}

                <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase opacity-60">Field_Instruction</label>
                    <textarea
                        rows={2}
                        value={tempField.description || ''}
                        onChange={(e) => updateField({ description: e.target.value })}
                        className="font-Google-Sans bg-black/40 border border-(--primary)/40 p-2 text-sm outline-none focus:border-(--primary) resize-none"
                        placeholder="Short helper text for this field..."
                    />
                </div>
            </div>

            <div className="mt-8 flex gap-3">
                <button
                    type="button"
                    onClick={onCancel}
                    className="flex-1 py-2 border border-white/10 text-[10px] uppercase hover:bg-white/5 transition-all cursor-pointer"
                >
                    Discard
                </button>
                <button
                    type="button"
                    onClick={() => {
                        const firstSelectValue = tempField.type === 'select' ? getSelectDefaultValue(tempField) : '';
                        onSave(tempField.type === 'select'
                            ? { ...tempField, default_value: firstSelectValue, placeholder: firstSelectValue }
                            : tempField
                        );
                    }}
                    className="flex-1 py-2 bg-(--primary) text-black font-black text-[10px] uppercase hover:brightness-110 transition-all cursor-pointer shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)]"
                >
                    Apply_Protocol
                </button>
            </div>
        </div>
    );
}

const directionPresets = ['to right', 'to left', 'to bottom', 'to top'];

function GradientConfig({ field, onChange }: { field: FieldConfig; onChange: (field: FieldConfig) => void }) {
    const gradient: GradientValue = {
        direction: field.config?.gradient?.direction || defaultGradientValue.direction,
        colors: field.config?.gradient?.colors?.length ? field.config.gradient.colors : defaultGradientValue.colors,
    };

    const updateGradient = (patch: Partial<GradientValue>) => {
        const nextGradient = { ...gradient, ...patch };
        onChange({
            ...field,
            default_value: `linear-gradient(${nextGradient.direction}, ${nextGradient.colors.join(', ')})`,
            config: { ...field.config, gradient: nextGradient },
        });
    };

    const updateColor = (index: number, color: string) => {
        const nextColors = [...gradient.colors];
        nextColors[index] = color.toUpperCase();
        updateGradient({ colors: nextColors });
    };

    const isPreset = directionPresets.includes(gradient.direction);
    const angleValue = gradient.direction.endsWith('deg') ? gradient.direction.replace('deg', '') : '90';

    return (
        <div className="mt-4 p-3 bg-black/40 border border-(--primary)/50 space-y-4 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
                <p className="text-[10px] text-(--primary) font-bold uppercase tracking-wider">Gradient_Settings</p>
                <div className="h-6 w-20 border border-(--primary)/30" style={{ background: `linear-gradient(${gradient.direction}, ${gradient.colors.join(', ')})` }} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_110px] gap-2 pt-2 border-t border-(--primary)/10">
                <div className="flex flex-col gap-1">
                    <label className="text-[8px] opacity-40 uppercase">Direction</label>
                    <select
                        value={isPreset ? gradient.direction : 'custom'}
                        onChange={(e) => updateGradient({ direction: e.target.value === 'custom' ? `${angleValue}deg` : e.target.value })}
                        className={`${compactInputClass} text-(--primary)`}
                    >
                        {directionPresets.map(direction => (
                            <option key={direction} value={direction} className="bg-black">{direction}</option>
                        ))}
                        <option value="custom" className="bg-black">Custom Angle</option>
                    </select>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-[8px] opacity-40 uppercase">Angle</label>
                    <input
                        type="number"
                        disabled={isPreset}
                        value={angleValue}
                        onChange={(e) => updateGradient({ direction: `${Number(e.target.value)}deg` })}
                        className={`${compactInputClass} disabled:opacity-30`}
                    />
                </div>
            </div>

            <div className="space-y-2">
                {gradient.colors.map((color, index) => (
                    <div key={index} className="flex items-end gap-2">
                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-[8px] opacity-40 uppercase">Color_{index + 1}</label>
                            <div className="flex gap-2">
                                <ColorPicker color={color.startsWith('#') ? color : '#FFFFFF'} onChange={(newColor) => updateColor(index, newColor)} />
                                <input
                                    type="text"
                                    value={color}
                                    onChange={(e) => {
                                        let val = e.target.value.toUpperCase();
                                        if (val && !val.startsWith('#')) val = '#' + val;
                                        if (val.length <= 9) updateColor(index, val);
                                    }}
                                    className={`${compactInputClass} flex-1`}
                                    placeholder="#FFFFFF"
                                />
                            </div>
                        </div>
                        <button
                            type="button"
                            disabled={gradient.colors.length <= 2}
                            onClick={() => updateGradient({ colors: gradient.colors.filter((_, i) => i !== index) })}
                            className="h-8 cursor-pointer border border-red-500/30 px-2 text-[10px] uppercase text-red-300 hover:border-red-500 disabled:cursor-not-allowed disabled:opacity-30 transition-colors"
                        >
                            Remove
                        </button>
                    </div>
                ))}
            </div>

            <button
                type="button"
                onClick={() => updateGradient({ colors: [...gradient.colors, '#FFFFFF'] })}
                className="w-full py-1 border border-dashed border-(--primary)/30 text-[9px] uppercase opacity-50 hover:opacity-100 hover:bg-(--primary)/5 transition-all cursor-pointer"
            >
                + Add_Color
            </button>
        </div>
    );
}

function DefaultValueConfig({ field, onChange }: { field: FieldConfig; onChange: (field: FieldConfig) => void }) {
    return (
        <div className="flex flex-col gap-1 animate-in fade-in duration-200">
            <label className="text-[10px] uppercase opacity-60">Default_Value / Placeholder</label>
            {field.type === 'bbcode' ? (
                <textarea
                    rows={5}
                    value={field.default_value}
                    onChange={(e) => onChange({ ...field, default_value: e.target.value, placeholder: e.target.value })}
                    className="font-Google-Sans bg-black/40 border border-(--primary)/40 p-2 text-sm outline-none focus:border-(--primary) transition-all resize-y"
                />
            ) : (
                <input
                    type="text"
                    value={field.default_value}
                    onChange={(e) => onChange({ ...field, default_value: e.target.value, placeholder: e.target.value })}
                    className="font-Google-Sans bg-black/40 border border-(--primary)/40 p-2 text-sm outline-none focus:border-(--primary) transition-all"
                />
            )}
        </div>
    );
}

function ColorConfig({ field, onChange }: { field: FieldConfig; onChange: (field: FieldConfig) => void }) {
    return (
        <div className="flex flex-col gap-1 animate-in slide-in-from-bottom-2">
            <label className="text-[10px] uppercase text-(--primary) font-bold">Initial_Color_Value (HEX)</label>
            <div className="flex gap-2">
                <ColorPicker
                    color={field.default_value.startsWith('#') ? field.default_value : '#FFFFFF'}
                    onChange={(newColor) => {
                        const upperColor = newColor.toUpperCase();
                        onChange({ ...field, default_value: upperColor, placeholder: upperColor });
                    }}
                />
                <input
                    type="text"
                    placeholder="#FFFFFF"
                    value={field.default_value}
                    onChange={(e) => {
                        let val = e.target.value.toUpperCase();
                        if (val && !val.startsWith('#')) val = '#' + val;
                        if (val.length <= 9) onChange({ ...field, default_value: val, placeholder: val });
                    }}
                    onBlur={() => {
                        if (field.default_value === '#') onChange({ ...field, default_value: '', placeholder: '' });
                    }}
                    className="font-Google-Sans flex-1 min-w-0 bg-black/20 border border-(--primary)/50 p-2 outline-none text-sm focus:border-(--primary)/75 transition-all duration-300"
                />
            </div>
        </div>
    );
}

function SliderConfig({ field, onChange }: { field: FieldConfig; onChange: (field: FieldConfig) => void }) {
    const sliders = field.config?.sliders || [defaultSlider];

    const updateSlider = (index: number, patch: Partial<typeof defaultSlider>) => {
        const nextSliders = [...sliders];
        nextSliders[index] = { ...nextSliders[index], ...patch };
        onChange({ ...field, config: { ...field.config, sliders: nextSliders } });
    };

    return (
        <div className="mt-4 p-3 bg-black/40 border border-(--primary)/50 space-y-4 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
                <p className="text-[10px] text-(--primary) font-bold uppercase tracking-wider">Slider_Settings</p>
            </div>

            <div className="space-y-4 pt-2 border-t border-(--primary)/10">
                {sliders.map((slider, index) => (
                    <div key={index} className="space-y-2 bg-white/5 p-2">
                        <div className="flex justify-between items-center">
                            <span className="text-[9px] text-(--primary)/70 font-mono">SLIDER_#{index + 1}</span>
                            {index > 0 && (
                                <button
                                    type="button"
                                    onClick={() => onChange({ ...field, config: { ...field.config, sliders: sliders.filter((_, i) => i !== index) } })}
                                    className="text-[9px] text-red-400 hover:underline cursor-pointer"
                                >
                                    [Remove]
                                </button>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-1 col-span-2">
                                <label className="text-[8px] opacity-40 uppercase">Slider_Label</label>
                                <input
                                    type="text"
                                    value={slider.label}
                                    onChange={(e) => updateSlider(index, { label: e.target.value })}
                                    className={compactInputClass}
                                    placeholder="e.g. Width / Padding"
                                />
                            </div>
                            <NumberInput label="Min" value={slider.min} onChange={(value) => updateSlider(index, { min: value })} />
                            <NumberInput label="Max" value={slider.max} onChange={(value) => updateSlider(index, { max: value })} />
                            <NumberInput label="Default" value={slider.default_value} onChange={(value) => updateSlider(index, { default_value: value })} highlight />
                            <div className="flex flex-col gap-1">
                                <label className="text-[8px] opacity-40 uppercase">Unit</label>
                                <input
                                    type="text"
                                    value={slider.unit}
                                    onChange={(e) => updateSlider(index, { unit: e.target.value })}
                                    className={compactInputClass}
                                    placeholder="px / %"
                                />
                            </div>
                        </div>
                    </div>
                ))}

                <button
                    type="button"
                    onClick={() => onChange({ ...field, config: { ...field.config, sliders: [...sliders, { ...defaultSlider, label: 'New Slider' }] } })}
                    className="w-full py-1 border border-dashed border-(--primary)/30 text-[9px] uppercase opacity-50 hover:opacity-100 hover:bg-(--primary)/5 transition-all cursor-pointer"
                >
                    + Add_Another_Slider
                </button>
            </div>
        </div>
    );
}

function NumberInput({ label, value, onChange, highlight }: { label: string; value: number; onChange: (value: number) => void; highlight?: boolean }) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-[8px] opacity-40 uppercase">{label}</label>
            <input
                type="number"
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className={`${compactInputClass} ${highlight ? 'text-yellow-500' : ''}`}
            />
        </div>
    );
}

function SelectConfig({
    field,
    options,
    onOptionsChange,
    onFieldChange,
}: {
    field: FieldConfig;
    options: SelectOptionConfig[];
    onOptionsChange: (options: SelectOptionConfig[]) => void;
    onFieldChange: (field: FieldConfig) => void;
}) {
    const updateOption = (index: number, patch: Partial<SelectOptionConfig>) => {
        const nextOptions = [...options];
        nextOptions[index] = { ...nextOptions[index], ...patch };
        onOptionsChange(nextOptions);
    };

    return (
        <div className="flex flex-col gap-3 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase text-(--primary) font-bold">Select_Options</label>
                <button
                    type="button"
                    onClick={() => onOptionsChange([...options, { option: 'Option', value: 'Value', type: '' }])}
                    className="ml-auto cursor-pointer border border-(--primary)/30 px-2 py-1 text-[10px] uppercase hover:border-(--primary) transition-colors"
                >
                    Add
                </button>
            </div>

            <div className="border border-(--primary)/30 bg-black/20 p-3 space-y-3">
                <label className="flex w-fit items-center gap-2 text-[10px] uppercase text-(--foreground)/60 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={field.config?.select_multiple || false}
                        onChange={(e) => onFieldChange({ ...field, config: { ...field.config, select_multiple: e.target.checked } })}
                    />
                    Select_Multiple
                </label>

                {field.config?.select_multiple && (
                    <div className="grid grid-cols-1 gap-2">
                        <div className="flex flex-col gap-1">
                            <label className="text-[8px] opacity-40 uppercase">Multiple_Separator</label>
                            <input
                                type="text"
                                value={field.config?.select_multiple_separator ?? ' '}
                                onChange={(e) => onFieldChange({ ...field, config: { ...field.config, select_multiple_separator: e.target.value } })}
                                className={compactInputClass}
                                placeholder="space / , / newline"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[8px] opacity-40 uppercase">Multiple_Output_Format</label>
                            <textarea
                                rows={2}
                                value={field.config?.select_multiple_format || ''}
                                onChange={(e) => onFieldChange({ ...field, config: { ...field.config, select_multiple_format: e.target.value } })}
                                className="font-Google-Sans bg-black/40 border border-(--primary)/30 p-2 text-xs outline-none focus:border-(--primary) resize-y"
                                placeholder="Optional. Use {{value}} for selected values."
                            />
                        </div>
                    </div>
                )}
            </div>

            {options.map((opt, index) => (
                <div key={index} className="p-3 bg-black/40 border border-(--primary)/40 space-y-3">
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_130px_auto] gap-2">
                        <div className="flex flex-col gap-1">
                            <label className="text-[8px] opacity-40 uppercase">Option_Label</label>
                            <input
                                type="text"
                                value={opt.option}
                                onChange={(e) => updateOption(index, { option: e.target.value })}
                                className={compactInputClass}
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[8px] opacity-40 uppercase">Input_Type</label>
                            <select
                                value={opt.type || ''}
                                onChange={(e) => updateOption(index, { type: e.target.value as SelectOptionConfig['type'] })}
                                className={`${compactInputClass} text-(--primary)`}
                            >
                                <option value="" className="bg-black">None</option>
                                <option value="text" className="bg-black">Text</option>
                                <option value="bbcode" className="bg-black">BBCode</option>
                                <option value="color" className="bg-black">Color</option>
                                <option value="slider" className="bg-black">Slider</option>
                                <option value="gradient" className="bg-black">Gradient</option>
                            </select>
                        </div>
                        <button
                            type="button"
                            disabled={options.length <= 1}
                            onClick={() => onOptionsChange(options.filter((_, i) => i !== index))}
                            className="self-end cursor-pointer border border-red-500/30 px-2 py-1 text-[10px] uppercase text-red-300 hover:border-red-500 disabled:cursor-not-allowed disabled:opacity-30 transition-colors"
                        >
                            Remove
                        </button>
                    </div>

                    {!opt.type && (
                        <div className="flex flex-col gap-1">
                            <label className="text-[8px] opacity-40 uppercase">Option_Value_HTML</label>
                            <textarea
                                rows={3}
                                value={opt.value}
                                onChange={(e) => updateOption(index, { value: e.target.value })}
                                className="font-Google-Sans bg-black/40 border border-(--primary)/30 p-2 text-xs outline-none focus:border-(--primary) resize-y"
                                placeholder="Plain value or HTML."
                            />
                        </div>
                    )}

                    {opt.type && (
                        <div className="pt-2 border-t border-(--primary)/10">
                            <p className="mb-2 text-[9px] text-(--primary)/70 font-bold uppercase">Extra_Input_Config: {opt.type}</p>
                            {opt.type === 'slider' && <SliderConfig field={field} onChange={onFieldChange} />}
                            {opt.type === 'color' && (
                                <SelectOptionDefaultConfig
                                    type="color"
                                    value={opt.default_value || '#FFFFFF'}
                                    onChange={(value) => updateOption(index, { default_value: value })}
                                />
                            )}
                            {opt.type === 'gradient' && <GradientConfig field={field} onChange={onFieldChange} />}
                            {opt.type === 'text' && (
                                <SelectOptionDefaultConfig
                                    type="text"
                                    value={opt.default_value || ''}
                                    onChange={(value) => updateOption(index, { default_value: value })}
                                />
                            )}
                            {opt.type === 'bbcode' && (
                                <SelectOptionDefaultConfig
                                    type="bbcode"
                                    value={opt.default_value || ''}
                                    onChange={(value) => updateOption(index, { default_value: value })}
                                />
                            )}

                            <label className="mt-3 flex w-fit items-center gap-2 text-[10px] uppercase text-(--foreground)/60 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={opt.has_format || false}
                                    onChange={(e) => updateOption(index, { has_format: e.target.checked })}
                                />
                                Use_Format
                            </label>

                            {opt.has_format && (
                                <div className="mt-2 flex flex-col gap-1">
                                    <label className="text-[8px] opacity-40 uppercase">Output_Format</label>
                                    <textarea
                                        rows={2}
                                        value={opt.format || ''}
                                        onChange={(e) => updateOption(index, { format: e.target.value })}
                                        className="font-Google-Sans bg-black/40 border border-(--primary)/30 p-2 text-xs outline-none focus:border-(--primary) resize-y"
                                        placeholder="Use {{value}} for the input value, e.g. linear-gradient({{value}} 0 0) or url({{value}})"
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ))}

            <p className="font-Google-Sans text-[9px] opacity-40">
                * Default uses <span className="text-yellow-500 font-bold underline">{getSelectDefaultValue(field) || '...'}</span>. HTML values are stored per option, so closing tags with / are safe.
            </p>
        </div>
    );
}

function SelectOptionDefaultConfig({
    type,
    value,
    onChange,
}: {
    type: 'text' | 'bbcode' | 'color';
    value: string;
    onChange: (value: string) => void;
}) {
    if (type === 'color') {
        return (
            <div className="flex flex-col gap-1 animate-in slide-in-from-bottom-2">
                <label className="text-[8px] opacity-40 uppercase">Default_Color</label>
                <div className="flex gap-2">
                    <ColorPicker
                        color={value.startsWith('#') ? value : '#FFFFFF'}
                        onChange={(newColor) => onChange(newColor.toUpperCase())}
                    />
                    <input
                        type="text"
                        placeholder="#FFFFFF"
                        value={value}
                        onChange={(e) => {
                            let val = e.target.value.toUpperCase();
                            if (val && !val.startsWith('#')) val = '#' + val;
                            if (val.length <= 9) onChange(val);
                        }}
                        className="font-Google-Sans flex-1 min-w-0 bg-black/20 border border-(--primary)/50 p-2 outline-none text-sm focus:border-(--primary)/75 transition-all duration-300"
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-1 animate-in fade-in duration-200">
            <label className="text-[8px] opacity-40 uppercase">Default_{type}</label>
            {type === 'bbcode' ? (
                <textarea
                    rows={5}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="font-Google-Sans bg-black/40 border border-(--primary)/40 p-2 text-sm outline-none focus:border-(--primary) transition-all resize-y"
                />
            ) : (
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="font-Google-Sans bg-black/40 border border-(--primary)/40 p-2 text-sm outline-none focus:border-(--primary) transition-all"
                />
            )}
        </div>
    );
}

function CheckboxConfig({ field, onChange }: { field: FieldConfig; onChange: (field: FieldConfig) => void }) {
    const trueValue = field.config?.true_value ?? 'true';
    const falseValue = field.config?.false_value ?? 'false';
    const defaultValue = field.default_value === trueValue ? trueValue : falseValue;

    const updateCheckboxConfig = (patch: NonNullable<FieldConfig['config']>) => {
        onChange({ ...field, config: { ...field.config, ...patch } });
    };

    const updateTrueValue = (value: string) => {
        onChange({
            ...field,
            default_value: defaultValue === trueValue ? value : field.default_value,
            placeholder: defaultValue === trueValue ? value : field.placeholder,
            config: { ...field.config, true_value: value },
        });
    };

    const updateFalseValue = (value: string) => {
        onChange({
            ...field,
            default_value: defaultValue === falseValue ? value : field.default_value,
            placeholder: defaultValue === falseValue ? value : field.placeholder,
            config: { ...field.config, false_value: value },
        });
    };

    return (
        <div className="mt-4 p-3 bg-black/40 border border-(--primary)/50 space-y-1 animate-in fade-in duration-300">
            <p className="text-[10px] text-(--primary) font-bold uppercase">Checkbox_Protocol</p>
            <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="flex flex-col gap-1 col-span-2">
                    <label className="text-[8px] opacity-40 uppercase">Default_State</label>
                    <select
                        value={defaultValue}
                        onChange={(e) => onChange({ ...field, default_value: e.target.value, placeholder: e.target.value })}
                        className={`${compactInputClass} text-(--primary)`}
                    >
                        <option value={trueValue} className="bg-black">{field.config?.true_label || 'ON'} / {trueValue}</option>
                        <option value={falseValue} className="bg-black">{field.config?.false_label || 'OFF'} / {falseValue}</option>
                    </select>
                </div>
                <CheckboxTextInput label="Checked_Value (If_True)" value={trueValue} onChange={updateTrueValue} />
                <CheckboxTextInput label="Unchecked_Value (If_False)" value={falseValue} onChange={updateFalseValue} />
                <CheckboxTextInput label="Label_When_Checked" value={field.config?.true_label ?? 'ON'} onChange={(value) => updateCheckboxConfig({ true_label: value })} tone="emerald" />
                <CheckboxTextInput label="Label_When_Unchecked" value={field.config?.false_label ?? 'OFF'} onChange={(value) => updateCheckboxConfig({ false_label: value })} tone="rose" />
            </div>
        </div>
    );
}

function CheckboxTextInput({ label, value, onChange, tone }: { label: string; value: string; onChange: (value: string) => void; tone?: 'emerald' | 'rose' }) {
    const toneClass = tone === 'emerald' ? 'text-emerald-500 border-emerald-500/30 focus:border-emerald-500' : tone === 'rose' ? 'text-rose-500 border-rose-500/30 focus:border-rose-500' : 'border-(--primary)/30 focus:border-(--primary)';

    return (
        <div className="flex flex-col gap-1">
            <label className={`text-[9px] opacity-50 uppercase ${tone ? 'font-black ' + toneClass.split(' ')[0] : ''}`}>{label}</label>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={`bg-black/40 border ${toneClass} p-2 text-xs outline-none`}
            />
        </div>
    );
}
