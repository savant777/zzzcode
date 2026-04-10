"use client";
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FieldConfig } from '@/lib/template-parser';

interface Props {
    field: FieldConfig;
    onEdit?: (field: FieldConfig) => void;
}

export default function TemplateFieldItem({ field, onEdit }: Props) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });

    const style = { 
        transform: CSS.Transform.toString(transform), 
        transition, 
        zIndex: isDragging ? 50 : 'auto', 
        opacity: isDragging ? 0.5 : 1 
    };

    return (
        <div 
            ref={setNodeRef} 
            style={style} 
            className={`
                group flex gap-4 p-2 border border-(--primary)/30 bg-black/40 hover:border-(--primary)/70 transition-all
                ${isDragging ? 'border-(--primary) shadow-lg' : ''}
            `}
        >
            {/* Drag Handle */}
            <div 
                {...attributes} 
                {...listeners} 
                className="flex flex-col gap-1 justify-center px-1 cursor-grab active:cursor-grabbing hover:bg-white/5"
            >
                <div className="w-1 h-1 bg-(--primary) rounded-full" />
                <div className="w-1 h-1 bg-(--primary) rounded-full" />
                <div className="w-1 h-1 bg-(--primary) rounded-full" />
            </div>

            {/* Field Info */}
            <div className="flex-1 min-w-0">
                <p className="text-[9px] text-(--primary)/60 font-mono tracking-tighter truncate mb-0.5">
                    {"{{" + field.variable_name + "}}"}
                </p>
                <h4 className="font-Google-Sans font-bold truncate uppercase text-sm leading-tight text-(--foreground)">
                    {field.label}
                </h4>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[8px] px-1 bg-(--primary)/15 text-(--primary) border border-(--primary)/20 uppercase font-black">
                        {field.type}
                    </span>
                    {field.default_value && (
                        <span className="text-[8px] opacity-40 truncate uppercase">
                            VAL: {field.default_value}
                        </span>
                    )}
                </div>
            </div>

            {/* Edit Button (Show only in Edit Page) */}
            {onEdit && (
                <button 
                    type="button" 
                    onClick={() => onEdit(field)}
                    className="max-h-fit self-center px-3 py-2 border border-(--primary)/30 text-(--primary) text-[9px] font-black hover:bg-(--primary) hover:text-(--background) transition-all cursor-pointer uppercase"
                >
                    Edit
                </button>
            )}
        </div>
    );
}