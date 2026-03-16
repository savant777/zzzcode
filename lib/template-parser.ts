export interface FieldConfig {
    id: string;
    variable_name: string;
    label: string;
    type: 'text' | 'bbcode' | 'color' | 'select' | 'slider' | 'checkbox';
    group_name: string; // [GROUP:...]
    group_order: number;
    field_order: number;
    default_value: string;
    placeholder?: string;
    description?: string;
    options?: string; // for select
    config?: {
        // --- for Slider ---
        sliders?: {
            label: string;
            min: number;
            max: number;
            step: number;
            unit: string;
            default_value: number;
        }[];

        // --- for "Select + Slider" ---
        has_custom_slider?: boolean;
        custom_trigger?: string; // เช่น 'custom'

        // --- for Checkbox ---
        // label เอาไว้โชว์ในหน้า UI (เช่น เปิด/ปิด)
        true_label?: string; 
        false_label?: string;
        // value เอาไว้ส่งไปแทนที่ใน {{variable}} (เช่น block / none)
        true_value?: string;
        false_value?: string;
    }
    block_name?: string; // [BLOCK:...]
    is_repeat?: boolean; // has [REPEAT:variable] or not
}

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
        html = html.replace(/\n/g, '<br>');
        
        html = html.replace(/<\/div><br>/g, '</div>')
                   .replace(/<\/ul><br>/g, '</ul>')
                   .replace(/<\/ol><br>/g, '</ol>')
                   .replace(/<li><br>/g, '<li>')
                   .replace(/<br><\/li>/g, '</li>');
    }

    return html;
};

export const syncFieldsFromHTML = (html: string, existingFields: FieldConfig[] = []): FieldConfig[] => {
    const fields: FieldConfig[] = [];
    
    // Regex: {{ variable : default [GROUP:name] }}
    const variableRegex = /\{\{([^}:[\]]+)(?::([^|[\]]+))?(?:\[GROUP:([^\]]+)\])?\}\}/g;
    const markerGroupRegex = /\[GROUP:([^\]]+)\]/i;
    const blockRegex = /\[BLOCK:([^\]]+)\]/i;

    let match;
    let lastGroupOrder = 0;
    const groupMap: Record<string, number> = {}; 
    const groupFieldCounters: Record<string, number> = {}; // re-order by group

    while ((match = variableRegex.exec(html)) !== null) {
        const variableName = match[1].trim();
        const defaultValue = match[2]?.trim() || variableName;
        const inlineGroup = match[3]?.trim();
        const startIndex = match.index;

        // find [BLOCK] scope
        const textBefore = html.substring(0, startIndex);
        const lastBlockOpen = textBefore.lastIndexOf("[BLOCK:");
        const lastBlockClose = textBefore.lastIndexOf("[/BLOCK:");
        let blockName = undefined;
        if (lastBlockOpen > lastBlockClose) {
            const blockTag = textBefore.substring(lastBlockOpen).match(blockRegex);
            if (blockTag) blockName = blockTag[1].trim();
        }

        // find [GROUP]
        let currentGroupName = "default";
        if (inlineGroup) {
            currentGroupName = inlineGroup;
        } else {
            const nearbyText = html.substring(Math.max(0, startIndex - 500), startIndex);
            const gMatch = nearbyText.match(markerGroupRegex);
            if (gMatch) currentGroupName = gMatch[1].trim();
        }

        // set group order
        if (groupMap[currentGroupName] === undefined) {
            groupMap[currentGroupName] = lastGroupOrder++;
            groupFieldCounters[currentGroupName] = 0; // set initial field order
        }

        // check duplicate & [REPEAT]
        const isDuplicateInNew = fields.some(f => f.variable_name === variableName);
        const isRepeat = html.includes(`[REPEAT:${variableName}]`);
        const isCheckbox = variableName.startsWith('is_');

        if (!isDuplicateInNew) {
            const oldField = existingFields.find(f => f.variable_name === variableName);
            const currentFieldOrder = groupFieldCounters[currentGroupName]++;

            if (oldField) {
                fields.push({
                    ...oldField,
                    group_name: currentGroupName,
                    group_order: oldField.group_order !== undefined ? oldField.group_order : groupMap[currentGroupName],
                    field_order: oldField.field_order !== undefined ? oldField.field_order : currentFieldOrder,
                    default_value: match[2]?.trim() || oldField.default_value,
                    placeholder: match[2]?.trim() || oldField.placeholder,
                    block_name: blockName,
                    is_repeat: isRepeat,
                    config: oldField.config || {} 
                });
            } else {
                fields.push({
                    id: crypto.randomUUID(),
                    variable_name: variableName,
                    label: variableName,
                    type: isRepeat ? 'slider' : (isCheckbox ? 'checkbox' : 'text'),
                    group_name: currentGroupName,
                    group_order: groupMap[currentGroupName],
                    field_order: currentFieldOrder,
                    default_value: defaultValue,
                    placeholder: defaultValue,
                    description: "",
                    options: "",
                    config: isRepeat? { 
                        sliders: [{ 
                            label: 'Value', 
                            min: -100, 
                            max: 100, 
                            step: 1, 
                            unit: 'px', 
                            default_value: Number(defaultValue) || 0 
                        }] 
                    } : isCheckbox? {
                        true_label: 'ON', 
                        false_label: 'OFF', 
                        true_value: 'true', 
                        false_value: 'false'
                    } : {},
                    block_name: blockName,
                    is_repeat: isRepeat
                });
            }
        }
    }
    return fields;
};

export const generateFinalHTML = (blueprint: string, values: any, fields: FieldConfig[], isExport: boolean = false) => {
    let output = blueprint;

    // [BLOCK] logic => duplicate element has {{variable}} inside [BLOCK][/BLOCK]
    const blockRegex = /\[BLOCK:([^\]]+)\]([\s\S]*?)\[\/BLOCK:\1\]/g;
    output = output.replace(blockRegex, (match, blockName, blockContent) => {
        const blockData = values[blockName] || [];
        return blockData.map((itemValues: any) => {
            let content = blockContent;
            fields.filter(f => f.block_name === blockName).forEach(field => {
                let val = itemValues[field.variable_name] ?? field.default_value;
                if (field.type === 'bbcode' && isExport) val = parseBBCode(val);
                content = content.replaceAll(`{{${field.variable_name}}}`, val);
            });
            return content;
        }).join('');
    });

    // [REPEAT] logic => duplicate element no {{variable}} inside [REPEAT][/REPEAT]
    const repeatRegex = /\[REPEAT:([^\]]+)\]([\s\S]*?)\[\/REPEAT\]/g;
    output = output.replace(repeatRegex, (match, varName, repeatContent) => {
        const count = parseInt(values[varName]) || 0;
        return Array(count).fill(repeatContent).join('');
    });

    // {{variable}} logic => replace value
    fields.filter(f => !f.block_name).forEach(field => {
        let val = values[field.variable_name] ?? field.default_value;

        if (field.type === 'slider' || (field.type === 'select' && field.config?.has_custom_slider)) {
            if (Array.isArray(val)) {
                val = val.map((v, idx) => {
                    const unit = field.config?.sliders?.[idx]?.unit || "";
                    return `${v}${unit}`;
                }).join(' ');
            }
        }

        if (field.type === 'bbcode' && isExport) val = parseBBCode(val);

        const variablePattern = new RegExp(`\\{\\{${field.variable_name}(?::[^}]+)?(?:\\[GROUP:[^\\]]+\\])?\\}\\}`, 'g');
        if (!val || val.trim() === "") {
            const emptyLinePattern = new RegExp(`^\\s*\\{\\{${field.variable_name}(?::[^}]+)?(?:\\[GROUP:[^\\]]+\\])?\\}\\}\\s*\\n?`, 'gm');
            
            if (emptyLinePattern.test(output)) {
                output = output.replace(emptyLinePattern, "");
            } else {
                output = output.replace(variablePattern, "");
            }
        } else {
            output = output.replace(variablePattern, val);
        }
    });

    // Clean up
    output = output.replace(/\[GROUP:[^\]]+\]/gi, '')
                   .replace(/\[BLOCK:[^\]]+\]|\[\/BLOCK:[^\]]+\]/gi, '')
                   .replace(/\[REPEAT:[^\]]+\]|\[\/REPEAT\]/gi, '');

    return output;
};

export const reorderFields = (fields: FieldConfig[], groupName: string, activeId: string, overId: string): FieldConfig[] => {
    const inGroup = fields.filter(f => f.group_name === groupName).sort((a, b) => a.field_order - b.field_order);
    const otherGroups = fields.filter(f => f.group_name !== groupName);

    const oldIndex = inGroup.findIndex(f => f.id === activeId);
    const newIndex = inGroup.findIndex(f => f.id === overId);

    if (oldIndex === -1 || newIndex === -1) return fields;

    const reordered = [...inGroup];
    const [movedItem] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, movedItem);

    const updatedInGroup = reordered.map((f, idx) => ({ ...f, field_order: idx }));

    return [...otherGroups, ...updatedInGroup];
};

export const reorderGroups = (fields: FieldConfig[], activeGroupName: string, overGroupName: string): FieldConfig[] => {
    const groupNames = Array.from(new Set(fields.map(f => f.group_name)))
        .sort((a, b) => {
            const fA = fields.find(f => f.group_name === a);
            const fB = fields.find(f => f.group_name === b);
            return (fA?.group_order ?? 0) - (fB?.group_order ?? 0);
        });

    const oldIndex = groupNames.indexOf(activeGroupName);
    const newIndex = groupNames.indexOf(overGroupName);

    if (oldIndex === -1 || newIndex === -1) return fields;

    const reorderedGroupNames = [...groupNames];
    const [movedGroup] = reorderedGroupNames.splice(oldIndex, 1);
    reorderedGroupNames.splice(newIndex, 0, movedGroup);

    return fields.map(field => ({
        ...field,
        group_order: reorderedGroupNames.indexOf(field.group_name)
    }));
};