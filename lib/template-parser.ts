export interface FieldConfig {
    id: string;
    variable_name: string;
    label: string;

    type: 'text' | 'bbcode' | 'color' | 'select' | 'slider' | 'checkbox' | 'gradient';
    
    block_name?: string;
    parent_block_name?: string;
    block_depth?: number;
    block_description?: string;
    block_order: number;

    group_name: string;
    group_order: number;

    field_order: number;
    default_value: string;
    placeholder?: string;
    description?: string;
    options?: string;
    config?: {
        select_options?: {
            option: string;
            value: string;
            type?: '' | 'text' | 'bbcode' | 'color' | 'slider' | 'gradient';
            default_value?: string;
            has_format?: boolean;
            format?: string;
        }[];
        select_multiple?: boolean;
        select_multiple_separator?: string;
        select_multiple_format?: string;
        sliders?: {
            label: string;
            min: number;
            max: number;
            step: number;
            unit: string;
            default_value: number;
        }[];
        gradient?: {
            colors: string[];
            direction: string;
        };
        true_label?: string; 
        false_label?: string;
        true_value?: string;
        false_value?: string;
        separate_placeholder?: boolean;
        show_word_count?: boolean;
        [key: string]: any;
    };
    is_repeat?: boolean;
}

export type SelectOptionConfig = {
    option: string;
    value: string;
    type?: '' | 'text' | 'bbcode' | 'color' | 'slider' | 'gradient';
    default_value?: string;
    has_format?: boolean;
    format?: string;
};

export type GradientValue = {
    direction: string;
    colors: string[];
};

type BlockScope = {
    blockName?: string;
    parentBlockName?: string;
    depth: number;
};

export const defaultGradientValue: GradientValue = {
    direction: 'to right',
    colors: ['#FFFFFF', '#000000'],
};

export const formatGradientValue = (gradient?: Partial<GradientValue> | string) => {
    if (typeof gradient === 'string') return gradient;

    const direction = gradient?.direction || defaultGradientValue.direction;
    const colors = gradient?.colors?.length ? gradient.colors : defaultGradientValue.colors;

    return `linear-gradient(${direction}, ${colors.join(', ')})`;
};

export const getSelectOptions = (field: FieldConfig): SelectOptionConfig[] => {
    if (field.config?.select_options?.length) {
        return field.config.select_options.map(opt => ({
            option: opt.option || opt.value || '',
            value: opt.value || '',
            type: opt.type || '',
            default_value: opt.default_value || '',
            has_format: opt.has_format || false,
            format: opt.format || ''
        }));
    }

    const separator = field.options?.includes('|') ? '|' : '/';

    return (field.options || '').split(separator)
        .map(opt => {
            const parts = opt.split(':').map(p => p.trim());
            return {
                option: parts[0] || '',
                value: parts[1] || parts[0] || '',
                type: (parts[2] || '') as SelectOptionConfig['type'],
                default_value: '',
                has_format: false,
                format: ''
            };
        })
        .filter(opt => opt.option || opt.value);
};

export const getSelectDefaultValue = (field: FieldConfig) => {
    return getSelectOptions(field)[0]?.value || '';
};

const formatSelectOutput = (format: string, value: string, rawValue?: any, field?: FieldConfig): string => {
    let output = format.replace(/\{\{value\}\}/g, value);

    if (Array.isArray(rawValue)) {
        rawValue.forEach((item, index) => {
            const unit = field?.config?.sliders?.[index]?.unit || '';
            const itemValue = `${item}${unit}`;
            output = output
                .replace(new RegExp(`\\{\\{${index}\\}\\}`, 'g'), itemValue)
                .replace(new RegExp(`\\{\\{value_${index + 1}\\}\\}`, 'g'), itemValue);
        });
    }

    if (rawValue && typeof rawValue === 'object' && Array.isArray(rawValue.colors)) {
        rawValue.colors.forEach((color: string, index: number) => {
            output = output.replace(new RegExp(`\\{\\{color_${index + 1}\\}\\}`, 'g'), color);
        });

        output = output.replace(/\{\{gradient_direction\}\}/g, rawValue.direction || defaultGradientValue.direction);
    }

    return output;
};

const resolveSelectValue = (field: FieldConfig, val: any): string => {
    const selectOptions = getSelectOptions(field);
    const selectedOption = typeof val?.option_index === 'number'
        ? selectOptions[val.option_index]
        : selectOptions.find(opt => opt.value === val?.value);
    const rawCustomValue = val?.custom_value;
    const customValue = selectedOption?.type === 'gradient'
        ? formatGradientValue(rawCustomValue)
        : Array.isArray(rawCustomValue)
        ? rawCustomValue.map((v: string | number, idx: number) => `${v}${field.config?.sliders?.[idx]?.unit || ""}`).join(' ')
        : rawCustomValue;

    if (selectedOption?.type) {
        return selectedOption.has_format && selectedOption.format
            ? formatSelectOutput(selectedOption.format, customValue ?? '', rawCustomValue, field)
            : String(customValue ?? '');
    }

    const optionValue = selectedOption?.value ?? val?.value ?? '';
    return selectedOption?.has_format && selectedOption.format
        ? formatSelectOutput(selectedOption.format, optionValue, optionValue, field)
        : optionValue;
};

export const normalizeFieldConfig = (field: FieldConfig): FieldConfig => {
    if (!field.config) return field;

    const nextConfig = { ...field.config };
    delete nextConfig[`has_${'custom_slider'}`];
    delete nextConfig[`custom_${'trigger'}`];
    if (field.type === 'select' || field.type === 'slider' || field.type === 'checkbox') {
        delete nextConfig.separate_placeholder;
    }

    const nextField = { ...field, config: nextConfig };
    if (field.type === 'select' || field.type === 'slider' || field.type === 'checkbox') {
        delete nextField.placeholder;
    }

    return nextField;
};

const preserveTextNewlines = (html: string): string => {
    const parts = html.split(/(<[^>]+>)/g);
    const isDivOrParagraphTag = (part?: string) => /^<\/?\s*(div|p)(\s|>|\/)/i.test(part || '');
    const isClosingDivOrParagraphTag = (part?: string) => /^<\/\s*(div|p)\s*>/i.test(part || '');
    const isHrTag = (part?: string) => /^<\s*hr(\s|>|\/)/i.test(part || '');
    const isLinkTag = (part?: string) => /^<\s*link(\s|>|\/)/i.test(part || '');
    const isBrTag = (part?: string) => /^<\s*br(\s|>|\/)/i.test(part || '');
    const isListTag = (part?: string) => /^<\/?\s*(ul|ol)(\s|>|\/)/i.test(part || '');
    return parts.map((part, index) => {
        if (part.startsWith('<') && part.endsWith('>')) return part;
        const previousTag = [...parts.slice(0, index)].reverse().find(item => item.startsWith('<') && item.endsWith('>'));
        const nextTag = parts.slice(index + 1).find(item => item.startsWith('<') && item.endsWith('>'));

        if (!part.trim()) {
            if (!/\r?\n/.test(part)) return part;

            return isDivOrParagraphTag(previousTag) ||
                isClosingDivOrParagraphTag(nextTag) ||
                isHrTag(previousTag) ||
                isLinkTag(previousTag) ||
                isBrTag(previousTag) ||
                isListTag(previousTag)
                ? ''
                : '<br>';
        }

        const trimmedPart = part
            .replace(isDivOrParagraphTag(previousTag) || isHrTag(previousTag) ? /^[ \t]*\r?\n/ : /^$/, '')
            .replace(isDivOrParagraphTag(nextTag) ? /\r?\n[ \t]*$/ : /$/, '');

        return trimmedPart.replace(/\r?\n/g, '<br>');
    }).join('');
};

const escapeRegExp = (value: string): string => {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const sameFieldScope = (field: FieldConfig, varName: string, blockName?: string, parentBlockName?: string) => {
    return field.variable_name === varName &&
        field.block_name === blockName &&
        field.parent_block_name === parentBlockName;
};

const extractYouTubeId = (input: string): string => {
    const trimmed = input.trim();
    if (!trimmed) return '';

    try {
        const url = new URL(trimmed);
        const videoId = url.searchParams.get('v');
        if (videoId) return videoId;

        const pathMatch = url.pathname.match(/\/(?:embed|shorts|live)\/([^/?#]+)/) || url.pathname.match(/^\/([^/?#]+)/);
        if (pathMatch?.[1]) return pathMatch[1];
    } catch {
        const urlMatch = trimmed.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([A-Za-z0-9_-]+)/);
        if (urlMatch?.[1]) return urlMatch[1];
    }

    return trimmed.replace(/^[^A-Za-z0-9_-]+|[^A-Za-z0-9_-]+$/g, '').split(/[?&#]/)[0];
};

export const parseBBCode = (text: string, convertNewlines: boolean = true): string => {
    if (!text) return "";

    const parseList = (input: string): string => {
        const findMatchingClose = (str: string, startIdx: number): number => {
            let depth = 1;
            let i = startIdx;
            while (i < str.length && depth > 0) {
                if (str.startsWith('[list', i) && (str[i + 5] === ']' || str[i + 5] === '=')) {
                    depth++;
                    i += 6;
                } else if (str.startsWith('[/list]', i)) {
                    depth--;
                    if (depth === 0) return i;
                    i += 7;
                } else {
                    i++;
                }
            }
            return -1;
        };

        let result = '';
        let i = 0;
        while (i < input.length) {
            const listMatch = input.slice(i).match(/^\[list(=1)?\]/);
            if (listMatch) {
                const openTag = listMatch[0];
                const isOrdered = listMatch[1] === '=1';
                const contentStart = i + openTag.length;
                const closeIdx = findMatchingClose(input, contentStart);

                if (closeIdx !== -1) {
                    const content = input.slice(contentStart, closeIdx);
                    const parsedContent = parseList(content);
                    const items = parsedContent.split('[*]')
                        .slice(1)
                        .map((item: string) => item.trim())
                        .filter((item: string) => item !== '')
                        .map((item: string) => `<li>${item}</li>`)
                        .join('');

                    const tag = isOrdered ? 'ol type="1"' : 'ul';
                    result += `<${tag} class="mycode_list">${items}</${isOrdered ? 'ol' : 'ul'}>`;
                    i = closeIdx + '[/list]'.length;
                } else {
                    result += input[i];
                    i++;
                }
            } else {
                result += input[i];
                i++;
            }
        }
        return result;
    };

    let html = text
        .replace(/\[b\]([\s\S]*?)\[\/b\]/g, '<span style="font-weight: bold;" class="mycode_b">$1</span>')
        .replace(/\[i\]([\s\S]*?)\[\/i\]/g, '<span style="font-style: italic;" class="mycode_i">$1</span>')
        .replace(/\[u\]([\s\S]*?)\[\/u\]/g, '<span style="text-decoration: underline;" class="mycode_u">$1</span>')
        .replace(/\[s\]([\s\S]*?)\[\/s\]/g, '<span style="text-decoration: line-through;" class="mycode_s">$1</span>')
        .replace(/\[align=(left|center|right|justify)\]([\s\S]*?)\[\/align\]/g, '<div style="text-align: $1;" class="mycode_align">$2</div>')
        .replace(/\[color=(#?[a-fA-F0-9]{3,6})\]([\s\S]*?)\[\/color\]/g, '<span style="color: $1;" class="mycode_color">$2</span>')
        .replace(/\[yt=([^\]]+)\]\[\/yt\]/gi, (_match, input) => {
            const videoId = extractYouTubeId(input);
            return videoId ? `<iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen="" style="aspect-ratio: 16 / 9;width: 100%;"></iframe>` : '';
        })
        .replace(/\[ytauto=([^\]]+)\]\[\/ytauto\]/gi, (_match, input) => {
            const videoId = extractYouTubeId(input);
            return videoId ? `<iframe src="https://www.youtube.com/embed/${videoId}?rel=0&controls=0&showinfo=0&autoplay=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen="" style="aspect-ratio: 16 / 9;width: 100%;"></iframe>` : '';
        })
        .replace(/\[hideyt=([^\]]+)\]\[\/hideyt\]/gi, (_match, input) => {
            const videoId = extractYouTubeId(input);
            return videoId ? `<iframe style="display:none;" width="0" height="0" src="https://www.youtube.com/embed/${videoId}?autoplay=1&loop=1&playlist=${videoId}" frameborder="0" allow="autoplay"></iframe>` : '';
        })
        .replace(/\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi, (_match, content) => `<div style="margin-top:5px"><div class="quotetitle"><input class="button2 btnlite" type="button" value="View Spoiler" style="text-align:center;width:115px;margin:0px;padding: 5px;background-color: #e7e7e7;color: black;border: 0;" onclick="if (this.parentNode.parentNode.getElementsByTagName('div')[1].getElementsByTagName('div')[0].style.display != '') { this.parentNode.parentNode.getElementsByTagName('div')[1].getElementsByTagName('div')[0].style.display = '';      this.innerText = ''; this.value = 'Hide Spoiler'; } else { this.parentNode.parentNode.getElementsByTagName('div')[1].getElementsByTagName('div')[0].style.display = 'none'; this.innerText = ''; this.value = 'View Spoiler'; }"></div><div class="quotecontent" style="margin: 5px 0px;padding: 15px;background: #202020;font-size: 13px;color: #fff;"><div style="display: none;">${content}</div></div></div>`)
        .replace(/\[hide\]([\s\S]*?)\[\/hide\]/gi, '<div class="hidden-content"><div class="hidden-content-title"><strong>เนื้อหาที่ถูกซ่อน</strong></div><div class="hidden-content-body">$1</div></div>')
        .replace(/\[hr\]/gi, '<hr class="mycode_hr">')
        .replace(/\[img=(\d+)x(\d+)\]([\s\S]*?)\[\/img\]/gi, (match, w, h, url) => {
            const fileName = url.split('/').pop() || "image";
            return `<img src="${url.trim()}" loading="lazy" width="${w}" height="${h}" alt="[Image: ${fileName}]" class="mycode_img">`;
        })
        .replace(/\[img\]([\s\S]*?)\[\/img\]/gi, (match, url) => {
            const fileName = url.split('/').pop() || "image";
            return `<img src="${url.trim()}" loading="lazy" alt="[Image: ${fileName}]" class="mycode_img">`;
        })
        .replace(/\[url=(.*?)\]([\s\S]*?)\[\/url\]/gi, (match, url, linkText) => {
            const safeUrl = url.startsWith('http') ? url : `http://${url}`;
            return `<a href="${safeUrl}" target="_blank" rel="noopener" class="mycode_url">${linkText}</a>`;
        });
    
    html = parseList(html);

    if (convertNewlines) {
        html = html.replace(/\n/g, '<br>')
                   .replace(/<\/div><br>/g, '</div>')
                   .replace(/<\/ul><br>/g, '</ul>')
                   .replace(/<\/ol><br>/g, '</ol>')
                   .replace(/<li><br>/g, '<li>')
                   .replace(/<br><\/li>/g, '</li>');
    }

    return html;
};

export const syncFieldsFromHTML = (html: string, existingFields: FieldConfig[] = []): FieldConfig[] => {
    const fields: FieldConfig[] = [];
    
    // find BLOCK scope
    const blockTags: { type: 'open' | 'close', name: string, pos: number }[] = [];
    const bOpenRegex = /\[BLOCK:([^\]]+)\]/g;
    const bCloseRegex = /\[\/BLOCK:([^\]]+)\]/g;
    
    let bMatch;
    while ((bMatch = bOpenRegex.exec(html)) !== null) blockTags.push({ type: 'open', name: bMatch[1], pos: bMatch.index });
    while ((bMatch = bCloseRegex.exec(html)) !== null) blockTags.push({ type: 'close', name: bMatch[1], pos: bMatch.index });
    blockTags.sort((a, b) => a.pos - b.pos);

    const getBlockScopeAtPos = (pos: number): BlockScope => {
        const stack: string[] = [];
        for (const tag of blockTags) {
            if (tag.pos > pos) break;
            if (tag.type === 'open') stack.push(tag.name);
            else stack.pop();
        }
        const limitedStack = stack.slice(-2);

        return {
            blockName: limitedStack[limitedStack.length - 1],
            parentBlockName: limitedStack.length > 1 ? limitedStack[limitedStack.length - 2] : undefined,
            depth: Math.min(1, Math.max(0, stack.length - 1)),
        };
    };

    // 2. find REPEAT varName
    const repeatRegex = /\[REPEAT:([^\]]+)\]/g;
    let rMatch;
    while ((rMatch = repeatRegex.exec(html)) !== null) {
        const varName = rMatch[1].trim();
        const blockScope = getBlockScopeAtPos(rMatch.index);
        const blockName = blockScope.blockName;
        const parentBlockName = blockScope.parentBlockName;
        
        if (!fields.some(f => sameFieldScope(f, varName, blockName, parentBlockName))) {
            const oldField = existingFields.find(f => sameFieldScope(f, varName, blockName, parentBlockName));
            const oldBlockField = existingFields.find(f => f.block_name === blockName && f.parent_block_name === parentBlockName);

            let initialVal = oldField?.default_value || "5";
            if (oldField?.config?.sliders?.[0]?.default_value !== undefined) {
                initialVal = String(oldField.config.sliders[0].default_value);
            }

            fields.push({
                ...(oldField || {}),
                id: oldField?.id || crypto.randomUUID(),
                variable_name: varName,
                label: oldField?.label || varName,
                type: oldField?.type || 'slider',
                block_name: blockName,
                parent_block_name: parentBlockName,
                block_depth: oldField?.block_depth ?? blockScope.depth,
                block_description: oldField?.block_description ?? oldBlockField?.block_description,
                block_order: oldField?.block_order ?? 0,
                group_name: oldField?.group_name || "Repeat_Element",
                group_order: oldField?.group_order ?? 90,
                field_order: oldField?.field_order ?? 0,
                default_value: initialVal,
                is_repeat: true,
                config: oldField?.config || { 
                    sliders: [{ label: 'Amount', min: 0, max: 10, step: 1, unit: '', default_value: parseInt(initialVal) }] 
                }
            } as FieldConfig);
        }
    }

    // 3. find {{variable}}
    const variableRegex = /\{\{([^}:[\]]+)(?::([^|[\]]+))?(?:\[GROUP:([^\]]+)\])?\}\}/g;
    const markerGroupRegex = /\[GROUP:([^\]]+)\]/i;
    let match;
    let lastBlockOrder = 0;
    let lastGroupOrder = 0;
    const blockMap: Record<string, number> = { "GLOBAL": 0 };
    const groupMap: Record<string, number> = {}; 

    while ((match = variableRegex.exec(html)) !== null) {
        const varName = match[1].trim();
        const defaultValue = match[2]?.trim() || varName;
        const inlineGroup = match[3]?.trim();
        const blockScope = getBlockScopeAtPos(match.index);
        const blockName = blockScope.blockName;
        const parentBlockName = blockScope.parentBlockName;
        const blockId = blockName ? `${parentBlockName || "ROOT"}>${blockName}` : "GLOBAL";

        if (blockMap[blockId] === undefined) blockMap[blockId] = ++lastBlockOrder;

        // find GROUP name
        let currentGroupName = "General";
        if (inlineGroup) {
            currentGroupName = inlineGroup;
        } else {
            const nearbyText = html.substring(Math.max(0, match.index - 500), match.index);
            const gMatch = nearbyText.match(markerGroupRegex);
            if (gMatch) currentGroupName = gMatch[1].trim();
        }

        const groupKey = `${blockId}-${currentGroupName}`;
        if (groupMap[groupKey] === undefined) groupMap[groupKey] = lastGroupOrder++;

        if (!fields.some(f => sameFieldScope(f, varName, blockName, parentBlockName))) {
            const oldField = existingFields.find(f => sameFieldScope(f, varName, blockName, parentBlockName));
            const oldBlockField = existingFields.find(f => f.block_name === blockName && f.parent_block_name === parentBlockName);
            fields.push({
                ...(oldField || {}),
                id: oldField?.id || crypto.randomUUID(),
                variable_name: varName,
                label: oldField?.label || varName,
                type: oldField?.type || (varName.startsWith('is_') ? 'checkbox' : 'text'),
                block_name: blockName,
                parent_block_name: parentBlockName,
                block_depth: oldField?.block_depth ?? blockScope.depth,
                block_description: oldField?.block_description ?? oldBlockField?.block_description,
                block_order: oldField?.block_order ?? blockMap[blockId],
                group_name: currentGroupName,
                group_order: oldField?.group_order ?? groupMap[groupKey],
                field_order: oldField?.field_order ?? 0,
                default_value: match[2]?.trim() || oldField?.default_value || defaultValue,
                is_repeat: false
            } as FieldConfig);
        }
    }

    return fields;
};

export const generateFinalHTML = (blueprint: string, values: any, fields: FieldConfig[], isExport: boolean = false): string => {
    const processTemplate = (content: string, currentValues: any, currentBlockName?: string, parentBlockName?: string): string => {
        let result = content;

        const renderBlocks = (input: string) => {
            const openRegex = /\[BLOCK:([^\]]+)\]/g;
            let output = '';
            let cursor = 0;
            let openMatch: RegExpExecArray | null;

            const findMatchingClose = (blockName: string, searchStart: number) => {
                const tagRegex = /\[(\/?)BLOCK:([^\]]+)\]/g;
                tagRegex.lastIndex = searchStart;
                let depth = 1;
                let tagMatch: RegExpExecArray | null;

                while ((tagMatch = tagRegex.exec(input)) !== null) {
                    const isClose = tagMatch[1] === '/';
                    const tagBlockName = tagMatch[2];
                    if (tagBlockName !== blockName) continue;

                    if (isClose) {
                        depth -= 1;
                        if (depth === 0) {
                            return {
                                contentStart: searchStart,
                                contentEnd: tagMatch.index,
                                closeEnd: tagRegex.lastIndex,
                            };
                        }
                    } else depth += 1;
                }

                return null;
            };

            while ((openMatch = openRegex.exec(input)) !== null) {
                const blockName = openMatch[1];
                const openStart = openMatch.index;
                const openEnd = openRegex.lastIndex;
                const closeMatch = findMatchingClose(blockName, openEnd);

                if (!closeMatch) continue;

                output += input.slice(cursor, openStart);

                const blockContent = input.slice(closeMatch.contentStart, closeMatch.contentEnd);
                const blockEntries = Array.isArray(currentValues[blockName])
                    ? currentValues[blockName]
                    : values[blockName] || [];

                if (Array.isArray(blockEntries)) {
                    output += blockEntries.map((entryValues: any) => {
                        return processTemplate(
                            blockContent,
                            { ...currentValues, ...entryValues },
                            blockName,
                            currentBlockName
                        );
                    }).join('');
                }

                cursor = closeMatch.closeEnd;
                openRegex.lastIndex = closeMatch.closeEnd;
            }

            return output + input.slice(cursor);
        };

        result = renderBlocks(result);

        // 1. [REPEAT:varName]...[/REPEAT]
        const repeatRegex = /\[REPEAT:([^\]]+)\]([\s\S]*?)\[\/REPEAT\]/g;
        result = result.replace(repeatRegex, (_, varName, repeatContent) => {
            const count = parseInt(currentValues[varName] ?? values[varName]) || 0;
            return Array(count).fill(repeatContent).join('');
        });

        // 2. replace {{variable}} for the current block scope only.
        const scopedFields = fields.filter(field => field.block_name === currentBlockName && field.parent_block_name === parentBlockName);
        scopedFields.forEach(field => {
            const varName = field.variable_name;
            const safeVarName = escapeRegExp(varName);
            let val = currentValues[varName] ?? values[varName] ?? field.default_value;

            if (field.type === 'select' && val && typeof val === 'object' && !Array.isArray(val)) {
                if (val.multiple && Array.isArray(val.selected)) {
                    const separator = field.config?.select_multiple_separator ?? ' ';
                    const joinedValue = val.selected.map((entry: any) => resolveSelectValue(field, entry)).filter(Boolean).join(separator);
                    val = field.config?.select_multiple_format
                        ? field.config.select_multiple_format.replace(/\{\{value\}\}/g, joinedValue)
                        : joinedValue;
                } else {
                    val = resolveSelectValue(field, val);
                }
            }

            if (field.type === 'select' && Array.isArray(val)) {
                const sliderOption = getSelectOptions(field).find(opt => opt.type === 'slider');
                if (sliderOption) {
                    const sliderValue = val.map((v, idx) => `${v}${field.config?.sliders?.[idx]?.unit || ""}`).join(' ');
                    val = sliderOption.has_format && sliderOption.format
                        ? formatSelectOutput(sliderOption.format, sliderValue, val, field)
                        : sliderValue;
                }
            }

            if (field.type === 'select' && typeof val === 'string') {
                const selectedOption = getSelectOptions(field).find(opt => opt.value === val);
                if (selectedOption?.has_format && selectedOption.format) {
                    val = formatSelectOutput(selectedOption.format, val, val, field);
                }
            }

            if (field.type === 'slider' && Array.isArray(val)) {
                val = val.map((v, idx) => `${v}${field.config?.sliders?.[idx]?.unit || ""}`).join(' ');
            }

            if (field.type === 'gradient') {
                val = formatGradientValue(val || field.config?.gradient);
            }

            if (field.type === 'bbcode' && isExport) {
                val = parseBBCode(val);
            }

            const variablePattern = new RegExp(`\\{\\{${safeVarName}(?::[^}]+)?(?:\\[GROUP:[^\\]]+\\])?\\}\\}`, 'g');
            
            if (!val || String(val).trim() === "") {
                const emptyLinePattern = new RegExp(`^\\s*\\{\\{${safeVarName}(?::[^}]+)?(?:\\[GROUP:[^\\]]+\\])?\\}\\}\\s*\\n?`, 'gm');
                result = result.replace(emptyLinePattern, "").replace(variablePattern, "");
            } else {
                result = result.replace(variablePattern, String(val));
            }
        });

        return result;
    };

    let output = processTemplate(blueprint, {});

    // Clean up
    output = output.replace(/\[GROUP:[^\]]+\]/gi, '')
                   .replace(/\[BLOCK:[^\]]+\]|\[\/BLOCK:[^\]]+\]/gi, '')
                   .replace(/\[REPEAT:[^\]]+\]|\[\/REPEAT\]/gi, '');

    if (isExport) {
        output = parseBBCode(output, false);
        output = preserveTextNewlines(output);
    }

    return output;
};

export const getBlocksConfig = (fields: FieldConfig[]) => {
    const blocks: Record<string, FieldConfig[]> = {};
    fields.forEach(f => {
        if (f.block_name) {
            if (!blocks[f.block_name]) blocks[f.block_name] = [];
            blocks[f.block_name].push(f);
        }
    });
    return blocks;
};

export const reorderFields = (fields: FieldConfig[], groupName: string, activeId: string, overId: string, blockName?: string, parentBlockName?: string): FieldConfig[] => {
    const isInScope = (field: FieldConfig) =>
        field.group_name === groupName &&
        (field.block_name || "GLOBAL") === (blockName || "GLOBAL") &&
        field.parent_block_name === parentBlockName;
    const inGroup = fields.filter(isInScope).sort((a, b) => a.field_order - b.field_order);
    const otherGroups = fields.filter(f => !isInScope(f));
    const oldIndex = inGroup.findIndex(f => f.id === activeId);
    const newIndex = inGroup.findIndex(f => f.id === overId);
    if (oldIndex === -1 || newIndex === -1) return fields;
    const reordered = [...inGroup];
    const [movedItem] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, movedItem);
    const updatedInGroup = reordered.map((f, idx) => ({ ...f, field_order: idx }));
    return [...otherGroups, ...updatedInGroup];
};

export const reorderGroups = (fields: FieldConfig[], blockName: string, activeGroupName: string, overGroupName: string, parentBlockName?: string): FieldConfig[] => {
    const isInBlock = (field: FieldConfig) =>
        (field.block_name || "GLOBAL") === blockName &&
        field.parent_block_name === parentBlockName;
    const fieldsInBlock = fields.filter(isInBlock);
    const otherFields = fields.filter(f => !isInBlock(f));

    const groupNames = Array.from(new Set(fieldsInBlock.map(f => f.group_name)))
        .sort((a, b) => {
            const fA = fieldsInBlock.find(f => f.group_name === a);
            const fB = fieldsInBlock.find(f => f.group_name === b);
            return (fA?.group_order ?? 0) - (fB?.group_order ?? 0);
        });

    const oldIndex = groupNames.indexOf(activeGroupName);
    const newIndex = groupNames.indexOf(overGroupName);

    if (oldIndex === -1 || newIndex === -1) return fields;

    const reorderedGroupNames = [...groupNames];
    const [movedGroup] = reorderedGroupNames.splice(oldIndex, 1);
    reorderedGroupNames.splice(newIndex, 0, movedGroup);

    const updatedInBlock = fieldsInBlock.map(field => ({
        ...field,
        group_order: reorderedGroupNames.indexOf(field.group_name)
    }));

    return [...otherFields, ...updatedInBlock];
};

export const reorderBlocks = (fields: FieldConfig[], activeBlockId: string, overBlockId: string, parentBlockName?: string): FieldConfig[] => {
    const isInBlockScope = (field: FieldConfig) => field.parent_block_name === parentBlockName;
    const blockNames = Array.from(new Set(fields.filter(isInBlockScope).map(f => f.block_name || "GLOBAL")))
        .sort((a, b) => {
            const fA = fields.find(f => isInBlockScope(f) && (f.block_name || "GLOBAL") === a);
            const fB = fields.find(f => isInBlockScope(f) && (f.block_name || "GLOBAL") === b);
            return (fA?.block_order ?? 0) - (fB?.block_order ?? 0);
        });

    const oldIndex = blockNames.indexOf(activeBlockId);
    const newIndex = blockNames.indexOf(overBlockId);

    if (oldIndex === -1 || newIndex === -1) return fields;

    const reorderedBlockNames = [...blockNames];
    const [movedBlock] = reorderedBlockNames.splice(oldIndex, 1);
    reorderedBlockNames.splice(newIndex, 0, movedBlock);

    return fields.map(field => isInBlockScope(field)
        ? {
            ...field,
            block_order: reorderedBlockNames.indexOf(field.block_name || "GLOBAL")
        }
        : field
    );
};
