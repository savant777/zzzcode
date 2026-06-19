"use client";

import { useState } from 'react';
import type { ReactNode } from 'react';
import { FieldConfig, GradientValue, defaultGradientValue, getSelectOptions } from '@/lib/template-parser';
import BBCodeEditor from './BBCodeEditor';
import ColorPicker from './ColorPicker';

interface FieldRendererProps {
    field: FieldConfig;
    value: any;
    onChange: (varName: string, newValue: any) => void;
    className?: string;
}

const isSafeLink = (href: string) => /^https?:\/\//i.test(href);

const renderDescriptionText = (text: string, keyPrefix: string): ReactNode[] => {
    const nodes: ReactNode[] = [];
    const urlRegex = /(https?:\/\/[^\s<]+)/gi;
    let lastIndex = 0;
    let match;

    while ((match = urlRegex.exec(text)) !== null) {
        if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));

        const href = match[0];
        nodes.push(
            <a key={`${keyPrefix}-url-${match.index}`} href={href} target="_blank" rel="noopener noreferrer" className="text-(--primary) underline underline-offset-2">
                {href}
            </a>
        );
        lastIndex = match.index + href.length;
    }

    if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
    return nodes;
};

const renderDescription = (description: string): ReactNode[] => {
    const nodes: ReactNode[] = [];
    const anchorRegex = /<a\s+href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
    let lastIndex = 0;
    let match;

    while ((match = anchorRegex.exec(description)) !== null) {
        if (match.index > lastIndex) {
            nodes.push(...renderDescriptionText(description.slice(lastIndex, match.index), `text-${lastIndex}`));
        }

        const href = match[2];
        const label = match[3].replace(/<[^>]*>/g, '');
        nodes.push(isSafeLink(href) ? (
            <a key={`anchor-${match.index}`} href={href} target="_blank" rel="noopener noreferrer" className="text-(--primary) underline underline-offset-2">
                {label || href}
            </a>
        ) : label);

        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < description.length) {
        nodes.push(...renderDescriptionText(description.slice(lastIndex), `text-${lastIndex}`));
    }

    return nodes;
};

const countWords = (input: string) => {
    const plainText = input
        .replace(/\[[^\]]+\]/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z0-9#]+;/gi, ' ')
        .trim();

    if (!plainText) return 0;

    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
        const segmenter = new Intl.Segmenter(['th', 'en'], { granularity: 'word' });
        const wordSegments = Array.from(segmenter.segment(plainText)).filter(segment => segment.isWordLike);
        const thaiAttachedPrefixes = new Set(['ก็', 'ไม่', 'จะ', 'ได้', 'ไป', 'มา']);
        const thaiAttachedSuffixes = new Set(['ที่', 'ไว้']);

        return wordSegments.reduce((count, segment, index) => {
            const currentSegment = segment.segment;
            const previousSegment = wordSegments[index - 1]?.segment || '';
            const nextSegment = wordSegments[index + 1]?.segment || '';
            const previousIsThai = /[\u0E00-\u0E7F]/.test(previousSegment);
            const nextIsThai = /[\u0E00-\u0E7F]/.test(nextSegment);
            const shouldAttachToNextThaiWord = thaiAttachedPrefixes.has(currentSegment) &&
                nextSegment !== 'มา' &&
                nextIsThai;
            const shouldAttachToPreviousThaiWord = thaiAttachedSuffixes.has(currentSegment) && previousIsThai;

            return shouldAttachToNextThaiWord || shouldAttachToPreviousThaiWord ? count : count + 1;
        }, 0);
    }

    return plainText.split(/\s+/).filter(Boolean).length;
};

function WordCount({ value }: { value: string }) {
    const wordCount = countWords(value);

    return (
        <div className="font-Google-Sans text-[10px] leading-none text-(--foreground)/40">
            word_count: {wordCount.toLocaleString('th-TH')} คำ
        </div>
    );
}

export default function FieldRenderer({ field, value, onChange, className }: FieldRendererProps) {
    const [showDescription, setShowDescription] = useState(false);
    const selectOptions = field.type === 'select' ? getSelectOptions(field) : [];
    const isSelectMultiple = field.type === 'select' && field.config?.select_multiple;
    const selectedMultipleEntries = isSelectMultiple && value?.multiple && Array.isArray(value.selected) ? value.selected : [];
    const sliderSelectOption = selectOptions.find(opt => opt.type === 'slider');
    const selectedSelectIndex = value && typeof value === 'object' && !Array.isArray(value) && typeof value.option_index === 'number'
        ? value.option_index
        : Array.isArray(value)
            ? Math.max(0, selectOptions.findIndex(opt => opt.value === sliderSelectOption?.value))
            : Math.max(0, selectOptions.findIndex(opt => opt.value === value));
    const selectedSelectOption = selectOptions[selectedSelectIndex];
    const selectedSelectValue = selectedSelectOption?.value || '';
    const selectedSelectSliderValues = Array.isArray(value)
        ? value
        : Array.isArray(value?.custom_value)
            ? value.custom_value
            : field.config?.sliders?.map(s => s.default_value) || [0];
    const directionPresets = ['to right', 'to left', 'to bottom', 'to top', 'to bottom right', 'to bottom left'];

    const handleSliderChange = (index: number, newValue: number) => {
        const currentArray = Array.isArray(value) 
        ? [...value] 
        : field.config?.sliders?.map(s => s.default_value) || [0];
        
        currentArray[index] = newValue;
        onChange(field.variable_name, currentArray);
    };

    const handleSelectCustomSliderChange = (index: number, newValue: number) => {
        const currentArray = [...selectedSelectSliderValues];

        currentArray[index] = newValue;

        onChange(field.variable_name, {
            option_index: selectedSelectIndex,
            value: selectedSelectValue,
            custom_value: currentArray,
        });
    };

    const handleSelectChange = (newIndex: number) => {
        const selectedOption = selectOptions[newIndex];

        if (!selectedOption?.type) {
            onChange(field.variable_name, selectedOption?.value || '');
            return;
        }

        const defaultCustomValue = selectedOption.type === 'slider'
            ? field.config?.sliders?.map(s => s.default_value) || [0]
            : selectedOption.type === 'gradient'
                ? field.config?.gradient || defaultGradientValue
            : selectedOption.type === 'color'
                ? selectedOption.default_value || '#FFFFFF'
                : selectedOption.default_value || '';

        onChange(field.variable_name, {
            option_index: newIndex,
            value: selectedOption.value,
            custom_value: defaultCustomValue,
        });
    };

    const createSelectEntry = (index: number) => {
        const selectedOption = selectOptions[index];

        if (!selectedOption?.type) return { option_index: index, value: selectedOption?.value || '' };

        const defaultCustomValue = selectedOption.type === 'slider'
            ? field.config?.sliders?.map(s => s.default_value) || [0]
            : selectedOption.type === 'gradient'
                ? field.config?.gradient || defaultGradientValue
            : selectedOption.type === 'color'
                ? selectedOption.default_value || '#FFFFFF'
                : selectedOption.default_value || '';

        return {
            option_index: index,
            value: selectedOption.value,
            custom_value: defaultCustomValue,
        };
    };

    const updateMultipleEntries = (entries: any[]) => {
        onChange(field.variable_name, { multiple: true, selected: entries });
    };

    const getMultipleEntry = (index: number) => selectedMultipleEntries.find((entry: any) => entry.option_index === index);

    return (
        <div className={`${className} flex flex-col gap-1 w-full`}>
            <div className="flex items-center gap-1">
                <label className="text-xs font-Google-Sans opacity-70">
                    {field.label || field.variable_name}
                </label>
                {field.description && (
                    <button
                        type="button"
                        aria-label={`Show description for ${field.label || field.variable_name}`}
                        aria-pressed={showDescription}
                        onClick={() => setShowDescription(prev => !prev)}
                        className="flex h-4 w-4 items-center justify-center rounded-full border border-(--primary)/40 text-[10px] font-bold leading-none text-(--primary)/70 hover:border-(--primary) hover:text-(--primary) transition-colors cursor-pointer"
                    >
                        i
                    </button>
                )}
            </div>
            {field.description && showDescription && (
                <p className="font-Google-Sans text-[10px] leading-relaxed text-(--foreground)/45">
                    {renderDescription(field.description)}
                </p>
            )}
                
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
                <>
                    <BBCodeEditor 
                        value={value || ''} 
                        onChange={(val) => onChange(field.variable_name, val)}
                    />
                    {field.config?.show_word_count && <WordCount value={value || ''} />}
                </>
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
                    {isSelectMultiple ? (
                        <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap gap-2">
                                {selectOptions.map((opt, index) => {
                                    const checked = !!getMultipleEntry(index);

                                    return (
                                        <button
                                            key={index}
                                            type="button"
                                            onClick={() => {
                                                if (checked) {
                                                    updateMultipleEntries(selectedMultipleEntries.filter((item: any) => item.option_index !== index));
                                                } else {
                                                    updateMultipleEntries([...selectedMultipleEntries, createSelectEntry(index)]);
                                                }
                                            }}
                                            className={`font-Google-Sans p-2 text-sm uppercase border transition-all cursor-pointer
                                                ${checked 
                                                    ? 'bg-(--primary) text-(--background) border-(--primary)' 
                                                    : 'text-(--foreground)/75 bg-black/20 border-(--primary)/30 hover:text-(--primary) hover:border-(--primary)'}
                                            `}
                                        >
                                            {opt.option}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex flex-col gap-2">
                                {selectOptions.map((opt, index) => {
                                    const entry = getMultipleEntry(index);
                                    const checked = !!entry;
                                    if (!checked || !opt.type) return null;

                                    return (
                                        <div key={index} className="border border-(--primary)/20 bg-black/20 p-2">
                                            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-(--primary)/70">
                                                {opt.option}
                                            </div>

                                            {opt.type === 'text' && (
                                            <input
                                                type="text"
                                                value={entry?.custom_value || ''}
                                                onChange={(e) => updateMultipleEntries(selectedMultipleEntries.map((item: any) => item.option_index === index ? { ...item, custom_value: e.target.value } : item))}
                                                className="mt-2 font-Google-Sans bg-black/40 border border-(--primary)/40 p-2 text-sm outline-none focus:border-(--primary) transition-all w-full"
                                                placeholder={field.placeholder}
                                            />
                                            )}

                                            {opt.type === 'bbcode' && (
                                            <div className="mt-2">
                                                <BBCodeEditor
                                                    value={entry?.custom_value || ''}
                                                    onChange={(val) => updateMultipleEntries(selectedMultipleEntries.map((item: any) => item.option_index === index ? { ...item, custom_value: val } : item))}
                                                />
                                                {field.config?.show_word_count && <WordCount value={entry?.custom_value || ''} />}
                                            </div>
                                            )}

                                            {opt.type === 'color' && (
                                            <div className="mt-2 flex gap-2">
                                                <ColorPicker
                                                    color={entry?.custom_value?.startsWith('#') ? entry.custom_value : '#FFFFFF'}
                                                    onChange={(newColor) => updateMultipleEntries(selectedMultipleEntries.map((item: any) => item.option_index === index ? { ...item, custom_value: newColor.toUpperCase() } : item))}
                                                />
                                                <input
                                                    type="text"
                                                    value={entry?.custom_value || ''}
                                                    onChange={(e) => {
                                                        let val = e.target.value.toUpperCase();
                                                        if (val && !val.startsWith('#')) { val = '#' + val; }
                                                        if (val.length <= 9) updateMultipleEntries(selectedMultipleEntries.map((item: any) => item.option_index === index ? { ...item, custom_value: val } : item));
                                                    }}
                                                    className="font-Google-Sans flex-1 min-w-0 bg-black/20 border border-(--primary)/50 p-2 outline-none text-sm focus:border-(--primary)/75 transition-all duration-300"
                                                    placeholder="#FFFFFF"
                                                />
                                            </div>
                                            )}

                                            {opt.type === 'slider' && (
                                            <div className="mt-2 flex flex-col gap-2 animate-in fade-in slide-in-from-top-1">
                                                {(field.config?.sliders || [{ label: 'Value', min: 0, max: 100, step: 1, unit: 'px', default_value: 0 }]).map((s, i) => {
                                                    const sliderValues = Array.isArray(entry?.custom_value) ? entry.custom_value : field.config?.sliders?.map(slider => slider.default_value) || [0];
                                                    const safeValue = sliderValues[i] ?? s.default_value;
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
                                                                onChange={(e) => {
                                                                    const nextValues = [...sliderValues];
                                                                    nextValues[i] = Number(e.target.value);
                                                                    updateMultipleEntries(selectedMultipleEntries.map((item: any) => item.option_index === index ? { ...item, custom_value: nextValues } : item));
                                                                }}
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

                                            {opt.type === 'gradient' && (
                                            <div className="mt-2">
                                                <GradientInput
                                                    value={entry?.custom_value}
                                                    fallback={field.config?.gradient}
                                                    directionPresets={directionPresets}
                                                    onChange={(newGradient) => updateMultipleEntries(selectedMultipleEntries.map((item: any) => item.option_index === index ? { ...item, custom_value: newGradient } : item))}
                                                />
                                            </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                    <>
                    <div className="relative">
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-(--primary) pointer-events-none">
                            <svg width="12" height="12" viewBox="0 0 524 524" fill="currentColor">
                                <path d="M64 191L98 157 262 320 426 157 460 191 262 387 64 191Z"/>
                            </svg>
                        </div>
                        <select 
                            value={String(selectedSelectIndex)}
                            onChange={(e) => handleSelectChange(Number(e.target.value))}
                            className="w-full font-Google-Sans bg-black/20 border border-(--primary)/50 p-2 text-sm text-(--primary) outline-none appearance-none cursor-pointer focus:border-(--primary)/75 transition-all duration-300 pr-6"
                        >
                            {selectOptions.map((opt, i) => {
                                return <option key={i} value={String(i)} className="bg-black">{opt.option}</option>;
                            })}
                        </select>
                    </div>
                    
                    {selectedSelectOption?.type === 'text' && (
                        <input
                            type="text"
                            value={value?.custom_value || ''}
                            onChange={(e) => onChange(field.variable_name, { option_index: selectedSelectIndex, value: selectedSelectValue, custom_value: e.target.value })}
                            className="font-Google-Sans bg-black/40 border border-(--primary)/40 p-2 text-sm outline-none focus:border-(--primary) transition-all"
                            placeholder={field.placeholder}
                        />
                    )}

                    {selectedSelectOption?.type === 'bbcode' && (
                        <div>
                            <BBCodeEditor
                                value={value?.custom_value || ''}
                                onChange={(val) => onChange(field.variable_name, { option_index: selectedSelectIndex, value: selectedSelectValue, custom_value: val })}
                            />
                            {field.config?.show_word_count && <WordCount value={value?.custom_value || ''} />}
                        </div>
                    )}

                    {selectedSelectOption?.type === 'color' && (
                        <div className="flex gap-2">
                            <ColorPicker
                                color={value?.custom_value?.startsWith('#') ? value.custom_value : '#FFFFFF'}
                                onChange={(newColor) => onChange(field.variable_name, { option_index: selectedSelectIndex, value: selectedSelectValue, custom_value: newColor.toUpperCase() })}
                            />
                            <input
                                type="text"
                                value={value?.custom_value || ''}
                                onChange={(e) => {
                                    let val = e.target.value.toUpperCase();
                                    if (val && !val.startsWith('#')) { val = '#' + val; }
                                    if (val.length <= 9) { onChange(field.variable_name, { option_index: selectedSelectIndex, value: selectedSelectValue, custom_value: val }); }
                                }}
                                className="font-Google-Sans flex-1 min-w-0 bg-black/20 border border-(--primary)/50 p-2 outline-none text-sm focus:border-(--primary)/75 transition-all duration-300"
                                placeholder="#FFFFFF"
                            />
                        </div>
                    )}

                    {selectedSelectOption?.type === 'slider' && (
                        <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1">
                            {(field.config?.sliders || [{ label: 'Value', min: 0, max: 100, step: 1, unit: 'px', default_value: 0 }]).map((s, i) => {
                                const safeValue = selectedSelectSliderValues[i] ?? s.default_value;
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
                                            onChange={(e) => handleSelectCustomSliderChange(i, Number(e.target.value))}
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

                    {selectedSelectOption?.type === 'gradient' && (
                        <GradientInput
                            value={value?.custom_value}
                            fallback={field.config?.gradient}
                            directionPresets={directionPresets}
                            onChange={(newGradient) => onChange(field.variable_name, { option_index: selectedSelectIndex, value: selectedSelectValue, custom_value: newGradient })}
                        />
                    )}
                    </>
                    )}
                </div>
            )}

            {field.type === 'gradient' && (
                <GradientInput
                    value={value}
                    fallback={field.config?.gradient}
                    directionPresets={directionPresets}
                    onChange={(newGradient) => onChange(field.variable_name, newGradient)}
                />
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

function GradientInput({
    value,
    fallback,
    directionPresets,
    onChange,
}: {
    value: any;
    fallback?: GradientValue;
    directionPresets: string[];
    onChange: (newGradient: GradientValue) => void;
}) {
    const gradient: GradientValue = {
        direction: value?.direction || fallback?.direction || defaultGradientValue.direction,
        colors: Array.isArray(value?.colors) && value.colors.length
            ? value.colors
            : fallback?.colors?.length ? fallback.colors : defaultGradientValue.colors,
    };
    const isPreset = directionPresets.includes(gradient.direction);
    const angleValue = gradient.direction.endsWith('deg') ? gradient.direction.replace('deg', '') : '90';

    const updateGradient = (patch: Partial<GradientValue>) => {
        onChange({ ...gradient, ...patch });
    };

    const updateColor = (index: number, color: string) => {
        const nextColors = [...gradient.colors];
        nextColors[index] = color.toUpperCase();
        updateGradient({ colors: nextColors });
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="h-8 border border-(--primary)/30" style={{ background: `linear-gradient(${gradient.direction}, ${gradient.colors.join(', ')})` }} />
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_90px] gap-2">
                <div className="relative">
                    <select
                        value={isPreset ? gradient.direction : 'custom'}
                        onChange={(e) => updateGradient({ direction: e.target.value === 'custom' ? `${angleValue}deg` : e.target.value })}
                        className="w-full font-Google-Sans bg-black/20 border border-(--primary)/50 p-2 text-sm text-(--primary) outline-none appearance-none cursor-pointer focus:border-(--primary)/75 transition-all duration-300"
                    >
                        {directionPresets.map(direction => (
                            <option key={direction} value={direction} className="bg-black">{direction}</option>
                        ))}
                        <option value="custom" className="bg-black">Custom Angle</option>
                    </select>
                </div>
                <input
                    type="number"
                    disabled={isPreset}
                    value={angleValue}
                    onChange={(e) => updateGradient({ direction: `${Number(e.target.value)}deg` })}
                    className="font-Google-Sans bg-black/20 border border-(--primary)/50 p-2 text-sm outline-none focus:border-(--primary)/75 disabled:opacity-30 transition-all duration-300"
                />
            </div>

            {gradient.colors.map((color, index) => (
                <div key={index} className="flex gap-2">
                    <ColorPicker color={color?.startsWith('#') ? color : '#FFFFFF'} onChange={(newColor) => updateColor(index, newColor)} />
                    <input
                        type="text"
                        value={color || ''}
                        onChange={(e) => {
                            let val = e.target.value.toUpperCase();
                            if (val && !val.startsWith('#')) val = '#' + val;
                            if (val.length <= 9) updateColor(index, val);
                        }}
                        className="font-Google-Sans flex-1 min-w-0 bg-black/20 border border-(--primary)/50 p-2 outline-none text-sm focus:border-(--primary)/75 transition-all duration-300"
                        placeholder="#FFFFFF"
                    />
                    <button
                        type="button"
                        disabled={gradient.colors.length <= 2}
                        onClick={() => updateGradient({ colors: gradient.colors.filter((_, i) => i !== index) })}
                        className="cursor-pointer border border-red-500/30 px-2 text-[10px] uppercase text-red-300 hover:border-red-500 disabled:cursor-not-allowed disabled:opacity-30 transition-colors"
                    >
                        Remove
                    </button>
                </div>
            ))}

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
