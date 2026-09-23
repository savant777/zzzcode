type CreditTag = {
    id: string | number;
    user_id: string | null;
    tag_groups: { name: string } | null;
};

export function creatorCreditChanges(tags: CreditTag[], existingIds: string[], nextId: string, uploaderId: string) {
    tagsWithCreatorCredit(tags, [], nextId, uploaderId);
    return {
        remove: [...new Set(existingIds)].filter(id => id !== nextId),
        add: existingIds.includes(nextId) ? [] : [nextId],
    };
}

export function tagsWithCreatorCredit(tags: CreditTag[], selectedIds: string[], creditId: string, uploaderId: string) {
    const isCreator = (tag: CreditTag) => tag.tag_groups?.name.trim().toLowerCase() === 'creators';
    const credit = tags.find(tag => String(tag.id) === creditId && isCreator(tag)
        && (tag.user_id === null || tag.user_id === uploaderId));
    if (!credit) throw new Error('แท็กครีเอเตอร์ใช้ไม่ได้แล้ว กรุณาเลือกใหม่หรือโหลดหน้าใหม่');
    const normalIds = selectedIds.filter(id => {
        const tag = tags.find(tag => String(tag.id) === id);
        if (!tag) throw new Error('บางแท็กถูกปิดหรือลบแล้ว กรุณาตรวจแท็กอีกครั้ง');
        return !isCreator(tag);
    });
    return [...new Set([...normalIds, creditId])];
}
