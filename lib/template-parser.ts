export interface FieldConfig {
    id: string;
    variable_name: string;
    label: string;

    type: 'text' | 'bbcode' | 'color' | 'select' | 'slider' | 'checkbox' | 'gradient';
    
    block_name?: string;
    block_order: number;

    group_name: string;
    group_order: number;

    field_order: number;
    default_value: string;
    placeholder?: string;
    description?: string;
    options?: string;
    config?: {
        sliders?: {
            label: string;
            min: number;
            max: number;
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
        [key: string]: any;
    };
    is_repeat?: boolean;
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

    const getBlockAtPos = (pos: number) => {
        const stack: string[] = [];
        for (const tag of blockTags) {
            if (tag.pos > pos) break;
            if (tag.type === 'open') stack.push(tag.name);
            else stack.pop();
        }
        return stack[stack.length - 1];
    };

    // 2. find REPEAT varName
    const repeatRegex = /\[REPEAT:([^\]]+)\]/g;
    let rMatch;
    while ((rMatch = repeatRegex.exec(html)) !== null) {
        const varName = rMatch[1].trim();
        const blockName = getBlockAtPos(rMatch.index);
        
        if (!fields.some(f => f.variable_name === varName && f.block_name === blockName)) {
            const oldField = existingFields.find(f => f.variable_name === varName && f.block_name === blockName);

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
        const blockName = getBlockAtPos(match.index);
        const blockId = blockName || "GLOBAL";

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

        if (!fields.some(f => f.variable_name === varName && f.block_name === blockName)) {
            const oldField = existingFields.find(f => f.variable_name === varName && f.block_name === blockName);
            fields.push({
                ...(oldField || {}),
                id: oldField?.id || crypto.randomUUID(),
                variable_name: varName,
                label: oldField?.label || varName,
                type: oldField?.type || (varName.startsWith('is_') ? 'checkbox' : 'text'),
                block_name: blockName,
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
    const processTemplate = (content: string, currentValues: any): string => {
        let result = content;

        // 1. [BLOCK:name]...[/BLOCK:name]
        const blockRegex = /\[BLOCK:([^\]]+)\]([\s\S]*?)\[\/BLOCK:\1\]/g;
        result = result.replace(blockRegex, (_, blockName, blockContent) => {
            const blockEntries = values[blockName] || [];
            if (!Array.isArray(blockEntries)) return "";

            return blockEntries.map((entryValues: any) => {
                return processTemplate(blockContent, { ...currentValues, ...entryValues });
            }).join('');
        });

        // 2. [REPEAT:varName]...[/REPEAT]
        const repeatRegex = /\[REPEAT:([^\]]+)\]([\s\S]*?)\[\/REPEAT\]/g;
        result = result.replace(repeatRegex, (_, varName, repeatContent) => {
            const count = parseInt(currentValues[varName] ?? values[varName]) || 0;
            return Array(count).fill(repeatContent).join('');
        });

        // 3. replace {{variable}}
        fields.forEach(field => {
            const varName = field.variable_name;
            let val = currentValues[varName] ?? values[varName] ?? field.default_value;

            if ((field.type === 'slider' || (field.type === 'select' && field.config?.has_custom_slider)) && Array.isArray(val)) {
                val = val.map((v, idx) => `${v}${field.config?.sliders?.[idx]?.unit || ""}`).join(' ');
            }

            if (field.type === 'bbcode' && isExport) {
                val = parseBBCode(val);
            }

            const variablePattern = new RegExp(`\\{\\{${varName}(?::[^}]+)?(?:\\[GROUP:[^\\]]+\\])?\\}\\}`, 'g');
            
            if (!val || String(val).trim() === "") {
                const emptyLinePattern = new RegExp(`^\\s*\\{\\{${varName}(?::[^}]+)?(?:\\[GROUP:[^\\]]+\\])?\\}\\}\\s*\\n?`, 'gm');
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

export const reorderGroups = (fields: FieldConfig[], blockName: string, activeGroupName: string, overGroupName: string): FieldConfig[] => {
    const fieldsInBlock = fields.filter(f => (f.block_name || "GLOBAL") === blockName);
    const otherFields = fields.filter(f => (f.block_name || "GLOBAL") !== blockName);

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

export const reorderBlocks = (fields: FieldConfig[], activeBlockId: string, overBlockId: string): FieldConfig[] => {
    const blockNames = Array.from(new Set(fields.map(f => f.block_name || "GLOBAL")))
        .sort((a, b) => {
            const fA = fields.find(f => (f.block_name || "GLOBAL") === a);
            const fB = fields.find(f => (f.block_name || "GLOBAL") === b);
            return (fA?.block_order ?? 0) - (fB?.block_order ?? 0);
        });

    const oldIndex = blockNames.indexOf(activeBlockId);
    const newIndex = blockNames.indexOf(overBlockId);

    if (oldIndex === -1 || newIndex === -1) return fields;

    const reorderedBlockNames = [...blockNames];
    const [movedBlock] = reorderedBlockNames.splice(oldIndex, 1);
    reorderedBlockNames.splice(newIndex, 0, movedBlock);

    return fields.map(field => ({
        ...field,
        block_order: reorderedBlockNames.indexOf(field.block_name || "GLOBAL")
    }));
};