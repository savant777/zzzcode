"use client";

import { getFormSections } from '@/lib/form-layout';
import { getBBCodeHeights, updateBBCodeHeight } from '@/lib/bbcode-height';
import EditorBlocks, { type EditorBlocksProps } from './EditorBlocks';
import FieldRenderer from './FieldRenderer';

export default function EditorForm(props: EditorBlocksProps & { onGlobalValue: (name: string, value: any) => void }) {
    return <>{getFormSections(props.fields).map(section => {
        if (section.kind !== 'group') return <EditorBlocks key={section.id} {...props}
            scope={section.kind === 'gblock' ? { groupName: section.name } : { blockName: section.name }} />;
        const fields = [...section.fields].sort((a, b) => (a.field_order ?? 0) - (b.field_order ?? 0));
        return <section key={section.id} aria-label={`Field group ${section.name}`} className="min-w-0">
            <h4 className="mb-2 border-l-2 border-(--primary) bg-(--primary)/5 px-2 py-1 text-xs font-bold uppercase tracking-[0.2em] text-(--primary)">{section.name}</h4>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{fields.map((field, index) => <FieldRenderer key={field.id}
                field={field} value={props.values[field.variable_name]} bbcodeHeights={getBBCodeHeights(props.values)}
                onBBCodeHeightChange={(key, height) => props.setValues(prev => updateBBCodeHeight(prev, [], key, height))}
                onChange={props.onGlobalValue}
                className={field.type === 'bbcode' || (fields.length % 2 !== 0 && index === 0) ? 'lg:col-span-2' : 'col-span-1'} />)}</div>
        </section>;
    })}</>;
}
