"use client";

import { FieldConfig } from '@/lib/template-parser';
import BBCodeEditor from './BBCodeEditor';
import ColorPicker from './ColorPicker';

interface FieldRendererProps {
    field: FieldConfig;
    value: any;
    onChange: (varName: string, newValue: any) => void;
    className?: string;
}

export default function FieldRenderer({ field, value, onChange, className }: FieldRendererProps) {
    const handleSliderChange = (index: number, newValue: number) => {
        const currentArray = Array.isArray(value) 
        ? [...value] 
        : field.config?.sliders?.map(s => s.default_value) || [0];
        
        currentArray[index] = newValue;
        onChange(field.variable_name, currentArray);
    };

    return (
        <div className={`${className} flex flex-col gap-1 w-full`}>
            <label className="text-xs font-Google-Sans opacity-70">
                {field.label || field.variable_name}
            </label>
                
            {/* --- TYPE: TEXT --- */}
            {field.type === 'text' && (
                <input
                    type="text"
                    value={value || ''}
                    onChange={(e) => onChange(field.variable_name, e.target.value)}
                    className="font-Google-Sans bg-black/40 border border-(--primary)/40 p-2 text-sm outline-none focus:border-(--primary) transition-all"
                    placeholder={field.placeholder}
                />
            )}

            {/* --- TYPE: BBCODE --- */}
            {field.type === 'bbcode' && (
                <BBCodeEditor 
                    value={value || ''} 
                    onChange={(val) => onChange(field.variable_name, val)}
                />
            )}

            {/* --- TYPE: COLOR --- */}
            {field.type === 'color' && (
                <div className="flex gap-2">
                    <ColorPicker 
                        color={value?.startsWith('#') ? value : '#FFFFFF'} 
                        onChange={(newColor) => {
                            onChange(field.variable_name, newColor.toUpperCase());
                        }} 
                    />
                    <input
                        type="text"
                        value={value || ''}
                        onChange={(e) => {
                            let val = e.target.value.toUpperCase();
                            if (val && !val.startsWith('#')) { val = '#' + val; }
                            if (val.length <= 9) { onChange(field.variable_name, val); }
                        }}
                        className="font-Google-Sans flex-1 min-w-0 bg-black/20 border border-(--primary)/50 p-2 outline-none text-sm focus:border-(--primary)/75 transition-all duration-300"
                        placeholder="#FFFFFF"
                    />
                </div>
            )}

            {/* --- TYPE: SELECT --- */}
            {field.type === 'select' && (
                <div className="flex flex-col gap-2">
                    <div className="relative">
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-(--primary) pointer-events-none">
                            <svg width="12" height="12" viewBox="0 0 524 524" fill="currentColor">
                                <path d="M64 191L98 157 262 320 426 157 460 191 262 387 64 191Z"/>
                            </svg>
                        </div>
                        <select 
                            value={Array.isArray(value) ? 'custom' : value}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === 'custom') {
                                    const defaultArray = field.config?.sliders?.map(s => s.default_value) || [0];
                                    onChange(field.variable_name, defaultArray);
                                } else {
                                    onChange(field.variable_name, val);
                                }
                            }}
                            className="w-full font-Google-Sans bg-black/20 border border-(--primary)/50 p-2 text-sm text-(--primary) outline-none appearance-none cursor-pointer focus:border-(--primary)/75 transition-all duration-300 pr-6"
                        >
                            {field.options?.split('/').map((opt, i) => {
                                const [label, val] = opt.includes(':') ? opt.split(':') : [opt, opt];
                                return <option key={i} value={val.trim()} className="bg-black">{label.trim()}</option>;
                            })}
                        </select>
                    </div>
                    
                    {/* Custom show Sliders */}
                    {field.config?.has_custom_slider && Array.isArray(value) && (
                        <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1">
                            {field.config.sliders?.map((s, i) => {
                                const safeValue = Array.isArray(value) ? (value[i] ?? s.default_value) : (value ?? s.default_value);
                                const percentage = ((Number(safeValue) - s.min) / (s.max - s.min)) * 100;

                                return (
                                    <div key={i} className="flex flex-col gap-1">
                                        <div className="flex justify-between text-[9px] uppercase opacity-50">
                                            <span>{s.label}</span>
                                            <span>{value[i] || 0}{s.unit}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min={s.min}
                                            max={s.max}
                                            step={s.step}
                                            value={value[i] || 0}
                                            onChange={(e) => handleSliderChange(i, Number(e.target.value))}
                                            className="w-full h-[4px] border border-(--primary)/50 appearance-none outline-none"
                                            style={{
                                                height: '4px',
                                                background: `linear-gradient(to right, rgba(from var(--primary) r g b/0.75) 0 ${percentage}%, var(--background) ${percentage}% 100%)`
                                            }}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* --- TYPE: SLIDER (MULTIPLE) --- */}
            {field.type === 'slider' && (
                <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1">
                    {(field.config?.sliders || [{ label: 'Value', min: 0, max: 100, step: 1, unit: 'px', default_value: 0 }]).map((s, i) => {
                        const safeValue = Array.isArray(value) ? (value[i] ?? s.default_value) : (value ?? s.default_value);
                        const percentage = ((Number(safeValue) - s.min) / (s.max - s.min)) * 100;

                        return (
                            <div key={i} className="flex flex-col gap-1">
                                <div className="flex justify-between text-[9px] uppercase opacity-50">
                                    <span>{s.label}</span>
                                    <span>{safeValue}{s.unit}</span>
                                </div>
                                <input
                                    type="range"
                                    min={s.min}
                                    max={s.max}
                                    step={s.step}
                                    value={safeValue}
                                    onChange={(e) => handleSliderChange(i, Number(e.target.value))}
                                    className="w-full h-[4px] border border-(--primary)/50 appearance-none outline-none"
                                    style={{
                                        height: '4px',
                                        background: `linear-gradient(to right, rgba(from var(--primary) r g b/0.75) 0 ${percentage}%, var(--background) ${percentage}% 100%)`
                                    }}
                                />
                            </div>
                        );
                    })}
                </div>
            )}

            {/* --- TYPE: SLIDER (MULTIPLE) --- */}
            {field.type === 'slider' && (
                <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1">
                    {(field.config?.sliders || []).map((s, i) => (
                        <div key={i} className="flex flex-col gap-1">
                            <div className="flex justify-between text-[9px] uppercase opacity-50">
                                <span>{s.label}</span>
                                <span>{value[i] || 0}{s.unit}</span>
                            </div>
                            <input
                                type="range"
                                min={s.min}
                                max={s.max}
                                step={s.step}
                                value={value[i] || 0}
                                onChange={(e) => handleSliderChange(i, Number(e.target.value))}
                                className="w-full h-[4px] border border-(--primary)/50 appearance-none outline-none"
                                style={{
                                    height: '4px',
                                    background: `linear-gradient(to right, rgba(from var(--primary) r g b/0.75) 0 ${
                                    ((Number(Array.isArray(value) ? value[i] : value) - s.min) / (s.max - s.min)) * 100
                                    }%, var(--background) ${
                                    ((Number(Array.isArray(value) ? value[i] : value) - s.min) / (s.max - s.min)) * 100
                                    }% 100%)`
                                }}
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* --- TYPE: CHECKBOX --- */}
            {field.type === 'checkbox' && (
                <label className="flex items-center gap-2 cursor-pointer w-fit">
                    <input
                        type="checkbox"
                        className="hidden"
                        checked={value === (field.config?.true_value || 'true')}
                        onChange={(e) => onChange(field.variable_name, e.target.checked ? (field.config?.true_value || 'true') : (field.config?.false_value || 'false'))}
                    />
                    <div className={`w-8 h-5 relative border border-(--primary)/50 flex items-center p-1 transition-all duration-500 ease-in-out ${value === (field.config?.true_value || 'true') ? 'bg-(--primary)' : 'bg-transparent'}`}>
                        <div className={`w-2.5 h-2.5 absolute transition-all duration-500 ease-in-out ${value === (field.config?.true_value || 'true') ? 'bg-black left-4' : 'bg-(--primary) left-1'}`} />
                    </div>
                    <span className="font-Google-Sans text-[10px] uppercase tracking-tighter">
                        {value === (field.config?.true_value || 'true') ? field.config?.true_label || 'ON' : field.config?.false_label || 'OFF'}
                    </span>
                </label>
            )}
        </div>
    );
}