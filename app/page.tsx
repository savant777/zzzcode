import { supabase } from '@/lib/supabase'
import Link from 'next/link';

export default async function Home() {
    const { data: templates, error } = await supabase
        .from('templates')
        .select('*')

    if (error) return <div className="p-10 text-red-500">เกิดข้อผิดพลาด: {error.message}</div>

    return (
        <main className="p-8 max-w-6xl mx-auto">
            <header className="mb-10 text-center">
                <h1 className="text-4xl font-bold text-gray-800">HTML Code Editor</h1>
                <p className="text-gray-500 mt-2">เลือกเทมเพลตที่คุณต้องการแก้ไข</p>
            </header>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {templates?.map((item) => (
                    <div key={item.id} className="border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                        <div className="bg-gray-200 h-40 flex items-center justify-center">
                            {item.preview_url ? (
                                <img src={item.preview_url} alt={item.title} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-gray-400">ไม่มีรูปพรีวิว</span>
                            )}
                        </div>
                        <div className="p-4">
                            <h2 className="text-xl font-bold">{item.title}</h2>
                            <span className="inline-block bg-blue-100 text-blue-600 text-xs px-2 py-1 rounded mt-1">
                                {item.category}
                            </span>
                            <Link href={`/editor/${item.id}`}>
                                <button className="w-full mt-4 bg-black text-white py-2 rounded-lg hover:bg-gray-800 transition-colors">
                                    {item.is_personal ? '🔒 ต้องใช้รหัสผ่าน' : 'เริ่มแก้ไข'}
                                </button>
                            </Link>
                        </div>
                    </div>
                ))}
            </div>
        </main>
    )
}