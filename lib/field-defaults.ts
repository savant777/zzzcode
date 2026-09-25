import { FieldConfig, defaultGradientValue, getSelectDefaultValue, getSelectOptions } from './template-parser';

export const getDefaultValue = (field: FieldConfig) => {
    if (field.type === 'slider') {
        return field.config?.sliders?.map(s => s.default_value) || field.default_value;
    }

    if (field.type === 'gradient') {
        return field.config?.gradient || defaultGradientValue;
    }

    if (field.type === 'checkbox') {
        const trueValue = field.config?.true_value ?? 'true';
        const falseValue = field.config?.false_value ?? 'false';

        return field.default_value === trueValue ? trueValue : falseValue;
    }

    if (field.type === 'select') {
        const defaultValue = getSelectDefaultValue(field);
        const defaultOption = getSelectOptions(field).find(opt => opt.value === defaultValue);
        const defaultEntry = (entry: Record<string, any>) => field.config?.select_multiple
            ? { multiple: true, selected: [entry] }
            : entry;

        if (defaultOption?.type === 'slider') {
            return defaultEntry({
                option_index: 0,
                value: defaultValue,
                custom_value: field.config?.sliders?.map(s => s.default_value) || [0],
            });
        }

        if (defaultOption?.type === 'gradient') {
            return defaultEntry({
                option_index: 0,
                value: defaultValue,
                custom_value: field.config?.gradient || defaultGradientValue,
            });
        }

        if (defaultOption?.type === 'color') {
            return defaultEntry({
                option_index: 0,
                value: defaultValue,
                custom_value: defaultOption.default_value || '#FFFFFF',
            });
        }

        if (defaultOption?.type === 'color-text') {
            return defaultEntry({
                option_index: 0,
                value: defaultValue,
                custom_value: {
                    color: defaultOption.default_value || '#FFFFFF',
                    text: defaultOption.secondary_default_value || '',
                },
            });
        }

        if (defaultOption?.type === 'text' || defaultOption?.type === 'bbcode') {
            return defaultEntry({
                option_index: 0,
                value: defaultValue,
                custom_value: defaultOption.default_value || '',
            });
        }

        if (field.config?.select_multiple) {
            return { multiple: true, selected: [{ option_index: 0, value: defaultValue }] };
        }

        return defaultValue;
    }

    return field.default_value;
};

