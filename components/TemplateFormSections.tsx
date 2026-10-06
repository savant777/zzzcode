"use client";

import type { ComponentProps } from 'react';
import type { FieldConfig } from '@/lib/template-parser';
import { getFormSections } from '@/lib/form-layout';
import TemplateBlockContainer from './TemplateBlockContainer';
import FormOrderEditor from './FormOrderEditor';

const groupsFor = (fields: FieldConfig[]) => {
    const groups: Record<string, FieldConfig[]> = {};
    [...fields].sort((a, b) => (a.group_order ?? 0) - (b.group_order ?? 0) || (a.field_order ?? 0) - (b.field_order ?? 0)).forEach(field => {
        const name = field.group_name || 'General';
        if (!groups[name]) groups[name] = [];
        groups[name].push(field);
    });
    return groups;
};

export default function TemplateFormSections({ fields, onFieldsChange, ...callbacks }: {
    fields: FieldConfig[]; onFieldsChange: (fields: FieldConfig[]) => void;
} & ComponentProps<typeof TemplateBlockContainer>) {
    const sections = getFormSections(fields);
    const renderBlock = (name: string, rootFields: FieldConfig[]) => {
        const childFields = fields.filter((field: FieldConfig) => field.parent_block_name === name);
        const names = [...new Set(childFields.sort((a: FieldConfig, b: FieldConfig) => (a.block_order ?? 0) - (b.block_order ?? 0)).map((f: FieldConfig) => f.block_name!))];
        return <TemplateBlockContainer key={name} {...callbacks} blockName={name} groups={groupsFor(rootFields)} disableSort
            childBlocks={names.map(blockName => ({ blockName, groups: groupsFor(childFields.filter((f: FieldConfig) => f.block_name === blockName)), childBlocks: [] }))} />;
    };
    return <><FormOrderEditor fields={fields} onChange={onFieldsChange} />
        {sections.map(section => <div key={section.id} className="min-w-0" aria-label={`ตั้งค่า ${section.kind} ${section.name}`}>
            {section.kind === 'group'
                ? <TemplateBlockContainer {...callbacks} blockName="GLOBAL" groups={groupsFor(section.fields)} disableSort />
                : section.kind === 'block' ? renderBlock(section.name, section.fields)
                : <div className="mb-4 border border-(--primary)/30 p-3 pt-5">
                    <h4 className="mb-5 break-words text-xs text-(--primary)">GBLOCK: {section.name}</h4>
                    {[...new Set(section.fields.sort((a, b) => (a.block_group_member_order ?? 0) - (b.block_group_member_order ?? 0)).map(f => f.block_name!))]
                        .map(name => renderBlock(name, section.fields.filter(f => f.block_name === name)))}
                </div>}
        </div>)}
    </>;
}
