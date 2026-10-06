"use client";

import { type MouseEvent, type WheelEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import Breadcrumbs from '@/components/Breadcrumbs';
import { requireCreator } from '@/lib/creator';

type GuideTableRow = {
    label: string;
    description: string;
    notes?: string[];
};

type GuideExample = {
    label: string;
    code: string;
    description?: string;
};

type GuideImage = {
    src: string;
    alt: string;
    width: number;
    height: number;
    wide?: boolean;
};

type GuideSection = {
    id: string;
    title: string;
    eyebrow: string;
    body?: string[];
    images?: GuideImage[];
    table?: GuideTableRow[];
    steps?: string[];
    examples?: GuideExample[];
};

const guideSections: GuideSection[] = [
    {
        id: 'overview', title: 'Creator Tools', eyebrow: '1 · เตรียมตัวก่อนสร้างเทมเพลต',
        body: ['คู่มือนี้สำหรับ Creator ตั้งแต่เตรียมโคด สร้างเทมเพลต ตั้งค่าฟอร์ม ไปจนถึงตรวจสอบก่อนแจกจ่าย เริ่มด้วยการเข้าสู่ระบบด้วยบัญชี Discord ที่ผูกกับโปรไฟล์ Creator ของคุณ'],
        images: [{ src: '/creator-guide/image13.png', alt: 'เมนูเครื่องมือสำหรับ Creator', width: 1918, height: 79, wide: true }],
        table: [
            { label: 'PROFILE', description: 'ตั้งชื่อและแท็ก Creator ที่ใช้ระบุเจ้าของผลงานบนเทมเพลตของคุณ' },
            { label: 'MANAGE TAGS', description: 'สร้าง แก้ไข หรือปิดการใช้งานแท็กหมวดหมู่ เพื่อจัดประเภทและช่วยให้ค้นหาเทมเพลตได้ง่าย' },
            { label: 'ADD TEMPLATE', description: 'เปิดหน้า Create เพื่อเพิ่มโคดต้นฉบับและข้อมูลเทมเพลตใหม่' },
            { label: 'EDIT', description: 'เปิดจากเทมเพลตที่คุณมีสิทธิ์แก้ไข เพื่อตั้งค่าฟิลด์ โครงสร้างฟอร์ม และข้อมูลเทมเพลต' },
        ],
    },
    {
        id: 'template-flow', title: 'Create And Edit', eyebrow: '2 · ขั้นตอนสร้างเทมเพลต',
        body: ['หน้า Create ใช้เตรียมข้อมูลและ Blueprint ระบบจะตรวจ marker และสร้างรายการฟิลด์ให้ ส่วนหน้า Edit ใช้ตั้งค่า input ของแต่ละฟิลด์ให้พร้อมใช้งาน'],
        steps: [
            'กรอกข้อมูลเทมเพลต เลือกแท็ก เครดิต และภาพ Preview',
            'วางโคดใน HTML_BLUEPRINT แล้วใส่ marker ในส่วนที่ต้องการให้แก้ไขหรือทำซ้ำ',
            'ตรวจ TEMPLATE_FIELDS ว่าพบตัวแปร กลุ่ม และบล็อกครบ แล้วตั้งค่า BLOCK ที่ต้องการ',
            'บันทึกเทมเพลตใหม่เป็น Inactive (is_active: false) ระบบจะเปิดหน้า Edit เพื่อตั้งค่าแต่ละฟิลด์ด้วยปุ่ม EDIT',
            'กด APPLY_PROTOCOL เมื่อแก้ฟิลด์เสร็จ จัดลำดับฟอร์ม แล้วกดบันทึกหน้า Edit อีกครั้ง',
            'หลังบันทึกหน้า Edit สำเร็จ ระบบจะถามว่าจะเปิดใช้งานไหม เลือก Activate เมื่อพร้อม หรือ Keep Inactive เพื่อเก็บไว้ก่อน',
            'เปิด Editor เพื่อตรวจผลลัพธ์ของเทมเพลตก่อนแจกจ่าย',
        ],
    },
    {
        id: 'template-info', title: 'Template Info', eyebrow: '3 · ข้อมูลและการเข้าถึง',
        body: ['ข้อมูลส่วนนี้ใช้แสดงเทมเพลตในหน้ารวม และกำหนดการเข้าถึงกับความสามารถของ Editor'],
        table: [
            { label: 'TEMPLATE_TITLE', description: 'ชื่อเทมเพลต' },
            { label: 'DESCRIPTION', description: 'คำอธิบายสั้น ๆ ว่าโคดใช้ทำอะไร' },
            { label: 'ASSIGN_TAGS', description: 'เลือกหมวดหมู่ที่ตรงกับโคด กด EXPAND_TAGS เพื่อดูตัวเลือกเพิ่มเติม และสร้างหมวดหมู่เพิ่มผ่าน MANAGE TAGS', notes: ['แท็ก Creator ใช้ระบุเจ้าของผลงาน ไม่ต้องสร้างเป็นแท็กหมวดหมู่ซ้ำ'] },
            { label: 'CREATOR_CREDIT', description: 'เลือกแท็ก Creator ที่ไม่ได้ผูกบัญชี แท็ก Creator ของตัวเองจะหายไปแต่ยังแสดงบน Template Card อยู่' },
            { label: 'PERSONAL_INFO', description: 'เลือกว่าจะเปิดเป็นสาธารณะหรือส่วนตัว และกำหนดรหัสผ่านสำหรับเทมเพลตส่วนตัวตามต้องการ' },
            { label: 'TEMPLATE_DRAFTS', description: 'กำหนดว่าเทมเพลตนี้จะเปิดระบบหลาย Draft ใน Editor หรือไม่ เหมาะกับโคดที่ต้องใช้หลายชุดข้อมูล' },
            { label: 'PREVIEW_IMAGE', description: 'ใส่ลิงก์ภาพตัวอย่าง แนะนำภาพอัตราส่วน 1:1 ที่เห็นลักษณะโคดชัดเจน', notes:['ขนาดที่ใช้โดยปกติคือ 600x600 px เว้นขอบบน-ล่าง 43px เว้นขอบซ้าย-ขวา 50px พื้นหลังสี #131313'] },
            { label: 'HTML_BLUEPRINT', description: 'วางโคด HTML หรือ BBCode ต้นฉบับพร้อม marker ที่จะสร้างฟอร์ม' },
        ],
    },
    {
        id: 'blueprint-syntax', title: 'Blueprint And Markers', eyebrow: '4 · เตรียมตัวแปรและส่วนทำซ้ำ',
        body: ['ใช้ Blueprint วางโครงสร้างโคดและตำแหน่งตัวแปร ส่วนค่าเริ่มต้นให้ตั้งใน Field Config หลังสร้างเทมเพลต ชื่อตัวแปรเดียวกันในขอบเขตเดียวกันจะใช้ค่าร่วมกัน จึงควรใช้คนละชื่อหากต้องการให้กรอกแยกกัน', 'เมื่อแก้ Blueprint ให้ตรวจรายการฟิลด์ที่ระบบตรวจพบอีกครั้ง โดยเฉพาะเมื่อเปลี่ยนชื่อ ย้ายขอบเขต หรือลบตัวแปร เพราะอาจทำให้การตั้งค่าที่ผูกกับฟิลด์เดิมเปลี่ยนไป'],
        examples: [
            { label: 'Variable', code: '<img src="{{image_url}}" />\n<h2>{{character_name}}</h2>', description: 'แทนส่วนที่ต้องการให้กรอกด้วย {{ชื่อตัวแปร}} จะใช้ชื่อภาษาไทยหรือภาษาอังกฤษก็ได้' },
            { label: 'Field Group', code: '{{character_name[GROUP:ข้อมูลพื้นฐาน]}}\n{{age[GROUP:ข้อมูลพื้นฐาน]}}', description: 'GROUP จัดฟิลด์เป็นหัวข้อในฟอร์ม ไม่ได้สร้างส่วนทำซ้ำ และไม่เปลี่ยนตำแหน่งโคดในผลลัพธ์' },
            { label: 'REPEAT', code: '[REPEAT:stars]\n<span>★</span>\n[/REPEAT]', description: 'สร้างฟิลด์สำหรับจำนวนครั้งและทำซ้ำโคดด้านในตามค่านั้น ระบบเริ่มต้นด้วย Slider สามารถตั้งช่วงและจำนวนเริ่มต้นใน Field Config เหมาะกับดาวหรือสัญลักษณ์ซ้ำ ต่างจาก BLOCK ที่มีข้อมูลแยกในแต่ละรายการ' },
        ],
    },
    {
        id: 'template-fields', title: 'Field Configuration', eyebrow: '5 · เลือกวิธีกรอกและค่าเริ่มต้น',
        images: [{ src: '/creator-guide/color-settings-example.png', alt: 'ตัวอย่างหน้าตั้งค่า Color แสดงค่า HEX และปุ่ม Apply — ข้อมูลตัวอย่าง', width: 466, height: 430 }],
        body: ['กด EDIT ที่การ์ดฟิลด์เพื่อตั้งชื่อที่แสดง ชนิด input ค่าเริ่มต้น และคำอธิบาย ชื่อที่แสดงเปลี่ยนได้โดยไม่ต้องเปลี่ยนชื่อตัวแปรใน Blueprint', 'Default Value คือค่าที่นำไปใช้งานจริง ส่วน Placeholder คือข้อความแนะนำในช่องกรอก ถ้าต้องการให้ต่างกันให้เปิด SEPARATE_PLACEHOLDER และกรอกแยก FIELD_INSTRUCTION ใช้อธิบายวิธีกรอกหรือข้อจำกัดของฟิลด์'],
        table: [
            { label: 'Text', description: 'ช่องข้อความสั้น เช่น ชื่อ ลิงก์รูป หรือค่าที่ไม่ต้องจัดรูปแบบ ตั้ง DEFAULT_VALUE และ Placeholder ตามต้องการ' },
            { label: 'BB Code', description: 'ข้อความที่ต้องมีเครื่องมือจัดรูปแบบ เลือก BBCODE_HEIGHT เป็น Compact หรือ Normal และเปิด SHOW_WORD_COUNT เมื่อต้องการตัวนับคำ' },
            { label: 'Color', description: 'กำหนดสีเริ่มต้นผ่านตัวเลือกสีหรือกรอกค่า HEX / RGB ช่อง HEX เติม # และแปลงเป็นตัวพิมพ์ใหญ่อัตโนมัติ เช่น ff8c00 เป็น #FF8C00 ส่วนชื่อสี HTML เช่น orange ไม่เติม #' },
            { label: 'Gradient', description: 'ตั้งสีหลายสีและทิศทางการไล่สี ค่าที่ได้ใช้เป็น linear-gradient จึงควรวางตัวแปรในตำแหน่งที่รองรับค่า Gradient' },
            { label: 'Select Menu', description: 'สร้างตัวเลือกพร้อมค่าที่ใช้แทนในโคด เลือก Default และจัดลำดับเมนูได้ ดูรายละเอียดต่อในหัวข้อถัดไป' },
            { label: 'Slider', description: 'ตั้ง Label, Min, Max, Default และ Unit ของแต่ละแถบเลื่อน เพิ่มหลาย Slider ในฟิลด์เดียวได้ตามรูปแบบค่าที่ต้องการ' },
            { label: 'Check Box', description: 'กำหนด DEFAULT_STATE, CHECKED_VALUE และ UNCHECKED_VALUE รวมทั้งข้อความที่แสดงเมื่อเปิดและปิด ค่าที่แทนในโคดไม่จำเป็นต้องเป็น true / false' },
            { label: 'APPLY_PROTOCOL', description: 'รับการตั้งค่าของฟิลด์นี้กลับเข้าแบบฟอร์ม ต้องกดบันทึกหน้า Edit เพื่อเก็บลงเทมเพลตด้วย' },
            { label: 'APPLY_SIMILAR', description: 'ใช้การตั้งค่ากับฟิลด์ที่ระบบจับคู่ว่าเป็นฟิลด์เดียวกันในขอบเขตที่เกี่ยวข้อง ตรวจฟิลด์ที่ได้รับผลก่อนบันทึก' },
            { label: 'DISCARD', description: 'ปิดหน้าตั้งค่าโดยไม่รับการแก้ไขในหน้าต่างนี้' },
        ],
    },
    {
        id: 'select-menu', title: 'Select Menu Options', eyebrow: '5.1 · ตัวเลือกและค่า Default',
        images: [{ src: '/creator-guide/select-settings-final-example.jpg', alt: 'ตัวอย่าง Select Menu พร้อม handle = และตัวเลือก DEFAULT — ข้อมูลตัวอย่าง', width: 449, height: 796 }],
        body: ['แต่ละตัวเลือกแยกชื่อที่แสดงในเมนูออกจากค่าที่ใส่ในโคด ทำให้แสดงชื่ออ่านง่ายแต่ส่งค่า HTML หรือ CSS ตามที่ Blueprint ต้องการได้'],
        table: [
            { label: 'ADD / REMOVE', description: 'เพิ่มหรือลบตัวเลือก' },
            { label: '= Handle', description: 'ลากเครื่องหมาย = เพื่อเรียงตัวเลือกใหม่' },
            { label: 'DEFAULT', description: 'ติ๊กเพื่อเลือกตัวเลือกเริ่มต้น' },
            { label: 'OPTION_LABEL', description: 'ตั้งชื่อเมนูสำหรับตัวเลือกนั้น' },
            { label: 'INPUT_TYPE', description: 'None ใช้ค่าตายตัว ส่วน Text, BB Code, Color, Color + Text, Slider และ Gradient ให้กรอกค่าต่อจากตัวเลือก พร้อมตั้งค่าเริ่มต้นของ input ย่อยได้' },
            { label: 'OPTION_VALUE_HTML', description: 'ตั้งค่าของตัวเลือกนั้น' },
            { label: 'Format', description: 'ใช้รูปแบบที่กำหนดครอบค่าจาก input ย่อย ตรวจว่าค่าที่สร้างเข้ากับตำแหน่งตัวแปรใน Blueprint' },
            { label: 'SELECT_MULTIPLE', description: 'เปิดให้เลือกได้หลายตัวเลือก และกำหนดตัวคั่นกับรูปแบบผลลัพธ์ให้เหมาะกับโคด' },
            { label: 'PRESET', description: 'ใช้ IMAGE_POSITION, IMAGE_SIZE หรือรูปแบบ CSS Variable เป็นจุดเริ่มต้น แล้วตรวจชื่อ ค่าที่ส่งออก และค่าเริ่มต้นก่อนใช้' },
        ],
    },
    {
        id: 'blocks', title: 'BLOCK And GBLOCK', eyebrow: '6 · โครงสร้างส่วนทำซ้ำ',
        images: [
            { src: '/creator-guide/block-settings-full-example.jpg', alt: 'ตัวอย่าง Group Block Scope รวม CHAT และ NOTI โดยตั้งค่าจำนวนแยกกัน — ข้อมูลตัวอย่าง', width: 641, height: 841 },
            { src: '/creator-guide/block-default-values-example.jpg', alt: 'ตัวอย่าง Custom default value แสดงช่องกรอกเฉพาะฟิลด์ที่ checked — ข้อมูลตัวอย่าง', width: 573, height: 290, wide: true },
        ],
        body: ['BLOCK ใช้ทำซ้ำส่วนที่มีข้อมูลแยกต่อรายการ เช่น สมาชิก ความสัมพันธ์ หรือข้อความแชต ส่วน GBLOCK รวม BLOCK หลายชนิดให้เป็นชุดเดียว เพื่อให้รายการต่างชนิดเรียงสลับกันในผลลัพธ์ได้', 'GROUP เป็นกลุ่มฟิลด์สำหรับจัดหน้าฟอร์ม ส่วน GBLOCK เป็นกลุ่มของ BLOCK สำหรับส่วนทำซ้ำ ทั้งสองอย่างมีหน้าที่ต่างกัน'],
        examples: [
            { label: 'BLOCK', code: '[BLOCK:relationships]\n<div>{{name}} — {{description}}</div>\n[/BLOCK:relationships]', description: 'เปิดและปิดด้วยชื่อเดียวกัน ตัวแปรด้านในมีค่าแยกในแต่ละรายการ' },
            { label: 'Nested BLOCK', code: '[BLOCK:character]\n<h2>{{name}}</h2>\n[BLOCK:skill]\n<div>{{skill_name}}</div>\n[/BLOCK:skill]\n[/BLOCK:character]', description: 'รองรับ BLOCK หลักและ BLOCK ลูก รวมสูงสุด 2 ชั้น บล็อกลูกของแต่ละรายการหลักมีข้อมูลและจำนวนแยกกัน' },
            { label: 'GBLOCK', code: '<section>\n[GBLOCK:conversation]\n[BLOCK:chat]<p>{{message}}</p>[/BLOCK:chat]\n[BLOCK:noti]<div>{{notice}}</div>[/BLOCK:noti]\n[/GBLOCK:conversation]\n</section>', description: 'ภายใน GBLOCK ใส่ได้เฉพาะ BLOCK กับช่องว่างหรือขึ้นบรรทัดใหม่ วาง HTML ที่ครอบทั้งหมดไว้นอก GBLOCK ไม่ซ้อน GBLOCK ใน BLOCK หรือ GBLOCK อื่น ใช้ชื่อ GBLOCK ไม่ซ้ำ และชื่อ BLOCK สมาชิกไม่ซ้ำกับ BLOCK หลักอื่น' },
        ],
        table: [
            { label: 'Min / Max', description: 'กำหนดจำนวนต่ำสุดและสูงสุดของ BLOCK ปล่อย Max ว่างเมื่อต้องการ Unlimited ข้อจำกัดนับแยกตามชนิด BLOCK และสำหรับบล็อกลูกจะนับแยกในแต่ละรายการหลัก' },
            { label: 'Initial', description: 'จำนวนรายการที่สร้างตอนเริ่ม Draft ใหม่ ต้องอยู่ในช่วง Min ถึง Max ถ้าต้องการส่วนที่เริ่มว่างให้ตั้ง Min และ Initial เป็น 0' },
            { label: 'Allow reordering', description: 'กำหนดว่ารายการ BLOCK ชนิดนี้ให้จัดลำดับได้หรือไม่ การสลับรายการในส่วนทำซ้ำมีผลต่อลำดับในโคดที่สร้าง' },
            { label: 'BLOCK_DESCRIPTION', description: 'ข้อความแนะนำที่แสดงเหนือรายการ ใช้บอกวิธีเพิ่มข้อมูลหรือเงื่อนไขของ BLOCK' },
            { label: 'Block Default Values', description: 'ตั้งค่า Default Value เฉพาะฟิลด์ที่ต้องการให้ต่างจาก Default Value กลาง มีผลกับดราฟต์ใหม่เท่านั้น', notes: ['เลือกหมายเลข Block ตามรายการเริ่มต้น แล้วเปิด Custom default value เฉพาะฟิลด์ที่ต้องการ', 'เมื่อ checked จึงแสดง input ตามชนิดของฟิลด์ BB Code ใช้แบบ Compact', 'ฟิลด์ที่ไม่เปิด Custom ใช้ค่าเริ่มต้นกลาง การเพิ่มรายการภายหลังใช้ค่าเริ่มต้นกลางเช่นกัน'] },
        ],
    },
    {
        id: 'form-order', title: 'Editor Form Order', eyebrow: '7 · จัดลำดับให้กรอกง่าย',
        body: ['จัดหน้าฟอร์มตามลำดับที่เหมาะกับคนกรอก เช่น ตั้งค่าทั่วไปก่อน ตามด้วยข้อมูลหลัก แล้วจึงส่วนทำซ้ำ ไม่จำเป็นต้องตรงกับลำดับตัวแปรใน Blueprint'],
        table: [
            { label: 'Field / Field Group', description: 'ลาก handle ของฟิลด์หรือกลุ่มเพื่อจัดลำดับภายในขอบเขตเดียวกัน ชื่อ GROUP จาก Blueprint เป็นหัวข้อของกลุ่มฟิลด์' },
            { label: 'Editor Form Order', description: 'เรียงส่วน FIELD GROUP, BLOCK และ GBLOCK ในหน้าฟอร์มด้วยเครื่องมือจัดลำดับส่วน ไม่ใช่การลากป้าย BLOCK SCOPE' },
            { label: 'Form And Output', description: 'การจัดลำดับฟอร์มเปลี่ยนตำแหน่งช่องกรอก ส่วนตำแหน่งโคดคงตาม Blueprint การเรียงรายการที่อยู่ใน BLOCK / GBLOCK เป็นอีกเรื่องและมีผลต่อผลลัพธ์ของส่วนทำซ้ำ' },
        ],
    },
    {
        id: 'tags-and-publish', title: 'Save, Test And Share', eyebrow: '8 · ตรวจสอบก่อนแจกจ่าย',
        body: ['หลังรับค่าจากหน้าต่างตั้งค่าฟิลด์หรือจัดลำดับแล้ว ให้กดบันทึกที่หน้า Create / Edit เพื่อเก็บการเปลี่ยนแปลงลงเทมเพลต จากนั้นเปิด Editor เพื่อตรวจในมุมของผู้ใช้', 'เทมเพลตใหม่เริ่มเป็น Inactive (is_active: false) เมื่อบันทึกหน้า Edit สำเร็จจะมีหน้าต่างถามว่าจะเปิดใช้งานไหม เลือก Activate หรือ Keep Inactive การปิดหน้าต่างยังคงสถานะ Inactive และข้อมูลที่บันทึกแล้วไม่หาย สามารถเปิดใช้งานภายหลังจากหน้ารวมเทมเพลตได้ เทมเพลตที่ Active อยู่แล้วจะไม่ถามซ้ำ'],
        steps: [
            'ตรวจชื่อ คำอธิบาย ภาพ Preview แท็ก และ Creator Credit',
            'ตรวจฟิลด์ครบตาม Blueprint ชื่ออ่านเข้าใจ และ input เหมาะกับค่าที่ต้องกรอก',
            'เริ่มข้อมูลใหม่เพื่อตรวจ Default Value, Select Default และค่า Custom ของแต่ละรายการเริ่มต้น',
            'ตรวจ REPEAT ว่าทำซ้ำตามจำนวน และ BLOCK / GBLOCK ว่าสร้างโคดครบทั้งรายการหลักและรายการลูก',
            'ทดสอบ Min, Max, Initial และ Allow reordering ให้ตรงกับข้อจำกัดที่ต้องการ',
            'ตรวจผลลัพธ์ HTML / BBCode ในตำแหน่งที่จะนำไปใช้งานจริง รวมทั้งสี รูปแบบ Select และหน่วยของ Slider',
            'ตรวจ Public / Personal และรหัสผ่านตามการเข้าถึงที่ต้องการ ก่อนส่งลิงก์เทมเพลตให้ผู้อื่น',
        ],
    },
];

export default function CreatorGuidePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState(guideSections[0].id);
    const [selectedImage, setSelectedImage] = useState<GuideImage | null>(null);
    const [imageZoom, setImageZoom] = useState(1);
    const imageScrollRef = useRef<HTMLDivElement | null>(null);
    const dragStartRef = useRef({
        isDragging: false,
        startX: 0,
        startY: 0,
        scrollLeft: 0,
        scrollTop: 0,
        moved: false,
    });

    const currentSection = useMemo(() => {
        return guideSections.find(section => section.id === activeSection) || guideSections[0];
    }, [activeSection]);

    const closeImage = useCallback(() => {
        setSelectedImage(null);
        setImageZoom(1);
    }, []);

    useEffect(() => {
        const initGuide = async () => {
            const session = await requireCreator();
            if (session.checkFailed) {
                toast.error('SESSION_CHECK_FAILED: Please retry. Locally saved drafts are still available.', {
                    id: 'creator-session-check', duration: Infinity,
                    action: { label: 'Retry', onClick: () => window.location.reload() },
                });
                return;
            }

            if (!session.user) {
                toast.error("ERROR_ACCESS_DENIED: LOGIN_REQUIRED");
                router.replace('/?group=category&tag=all');
                return;
            }

            if (!session.canAccessCreatorTools) {
                toast.error("ERROR_ACCESS_DENIED: CREATOR_REQUIRED");
                router.replace('/?group=category&tag=all');
                return;
            }

            setLoading(false);
        };

        initGuide();
    }, [router]);

    useEffect(() => {
        if (!selectedImage) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeImage();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [closeImage, selectedImage]);

    const updateImageZoom = (nextZoom: number) => {
        setImageZoom(Math.min(4, Math.max(1, Number(nextZoom.toFixed(2)))));
    };

    const handleImageWheel = (event: WheelEvent<HTMLDivElement>) => {
        event.preventDefault();
        updateImageZoom(imageZoom + (event.deltaY < 0 ? 0.2 : -0.2));
    };

    const toggleImageZoom = () => {
        if (dragStartRef.current.moved) return;
        updateImageZoom(imageZoom > 1 ? 1 : 2);
    };

    const handleImageMouseDown = (event: MouseEvent<HTMLDivElement>) => {
        if (imageZoom <= 1 || !imageScrollRef.current) return;

        event.preventDefault();
        dragStartRef.current = {
            isDragging: true,
            startX: event.clientX,
            startY: event.clientY,
            scrollLeft: imageScrollRef.current.scrollLeft,
            scrollTop: imageScrollRef.current.scrollTop,
            moved: false,
        };
    };

    const handleImageMouseMove = (event: MouseEvent<HTMLDivElement>) => {
        if (!dragStartRef.current.isDragging || !imageScrollRef.current) return;

        event.preventDefault();
        const deltaX = event.clientX - dragStartRef.current.startX;
        const deltaY = event.clientY - dragStartRef.current.startY;

        if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
            dragStartRef.current.moved = true;
        }

        imageScrollRef.current.scrollLeft = dragStartRef.current.scrollLeft - deltaX;
        imageScrollRef.current.scrollTop = dragStartRef.current.scrollTop - deltaY;
    };

    const stopImageDrag = () => {
        dragStartRef.current.isDragging = false;
        window.setTimeout(() => {
            dragStartRef.current.moved = false;
        }, 0);
    };

    if (loading) {
        return (
            <div className="flex flex-col h-full overflow-hidden relative font-Google-Code">
                <div className="z-10 bg-(--background) p-4 pt-1 flex flex-wrap">
                    <Breadcrumbs editorMode="GUIDE" />
                </div>
                <div className="flex-1 overflow-y-auto px-4 mb-4 scrollbar-hide">
                    <div className="min-h-full flex items-center justify-center border border-dashed border-(--primary)/10 text-[10px] opacity-20 uppercase tracking-widest select-none">
                        Loading_Creator_Guide...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden relative font-Google-Code">
            <div className="z-10 bg-(--background) p-4 pt-1 flex flex-wrap">
                <Breadcrumbs editorMode="GUIDE" />
                <button onClick={() => router.back()} className="ml-auto text-[10px] md:text-xs cursor-pointer flex items-center gap-1 hover:translate-x-[-4px] transition-all text-(--foreground)/75">
                    <span className="hidden lg:inline">&lt; BACK_TO_DASHBOARD</span>
                    <span className="lg:hidden">&lt; BACK</span>
                </button>
            </div>

            <main className="lg:grid flex flex-col min-h-0 flex-1 gap-4 overflow-hidden px-4 mb-4 lg:grid-cols-[240px_1fr]">
                <aside className="min-h-0 border border-(--primary) bg-(--background) p-3 lg:overflow-y-auto scrollbar-hide">
                    <div className="mb-3 border-b border-(--primary)/30 pb-2 text-sm uppercase tracking-[0.2em] text-(--foreground)/40">
                        Guide_Index
                    </div>
                    <nav className="flex flex-wrap gap-2 overflow-x-auto lg:flex-col lg:overflow-x-visible scrollbar-hide">
                        {guideSections.map(section => (
                            <button
                                key={section.id}
                                type="button"
                                onClick={() => setActiveSection(section.id)}
                                className={`flex-1 lg:flex-none whitespace-nowrap shrink-0 border px-3 py-2 text-left text-sm uppercase transition-colors cursor-pointer lg:w-full ${
                                    activeSection === section.id
                                        ? 'border-(--primary) bg-(--primary) text-black font-bold'
                                        : 'border-(--primary)/20 text-(--foreground)/60 hover:border-(--primary) hover:text-(--primary)'
                                }`}
                            >
                                {section.title}
                            </button>
                        ))}
                    </nav>
                </aside>

                <section className="max-lg:flex-1 min-h-0 overflow-y-auto border border-(--primary) bg-(--background) text-(--foreground) scrollbar-hide">
                    <div className="sticky top-0 z-5 border-b border-(--primary)/75 bg-(--background) p-4">
                        <div className="mb-1 font-Google-Sans uppercase tracking-wide text-(--foreground)/40">
                            {currentSection.eyebrow}
                        </div>
                        <h1 className="text-3xl md:text-5xl text-(--primary) uppercase leading-none">
                            {currentSection.title}
                        </h1>
                    </div>

                    <div className="space-y-6 p-4">
                        {currentSection.body && (
                            <div className="space-y-4 font-Google-Sans leading-relaxed text-(--foreground)/75">
                                {currentSection.body.map((paragraph, index) => (
                                    <p key={index}>{paragraph}</p>
                                ))}
                            </div>
                        )}

                        {currentSection.images && (
                            <div className="grid gap-3 md:grid-cols-2">
                                {currentSection.images.map(image => (
                                    <figure
                                        key={image.src}
                                        className={`border border-(--primary)/30 bg-black/20 p-2 ${image.wide ? 'md:col-span-2' : ''}`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setImageZoom(1);
                                                setSelectedImage(image);
                                            }}
                                            className="block w-full cursor-zoom-in"
                                            aria-label={`Open image: ${image.alt}`}
                                        >
                                            <Image
                                                src={image.src}
                                                alt={image.alt}
                                                width={image.width}
                                                height={image.height}
                                                className="max-h-[520px] w-full object-contain transition-opacity hover:opacity-80"
                                            />
                                        </button>
                                        <figcaption className="mt-2 font-Google-Sans leading-relaxed text-(--foreground)/45">
                                            {image.alt}
                                        </figcaption>
                                    </figure>
                                ))}
                            </div>
                        )}

                        {currentSection.steps && (
                            <ol className="space-y-2 font-Google-Sans leading-relaxed text-(--foreground)/75">
                                {currentSection.steps.map((step, index) => (
                                    <li key={step} className="grid grid-cols-[28px_1fr] gap-3">
                                        <span className="flex h-6 w-6 items-center justify-center border border-(--primary)/40 font-Google-Code text-[10px] text-(--primary)">
                                            {index + 1}
                                        </span>
                                        <span>{step}</span>
                                    </li>
                                ))}
                            </ol>
                        )}

                        {currentSection.table && (
                            <div className="overflow-hidden border border-(--primary)/30">
                                {currentSection.table.map(row => (
                                    <div key={row.label} className="grid gap-2 border-b border-(--primary)/20 p-3 last:border-b-0 md:grid-cols-[180px_1fr]">
                                        <div className="font-Google-Code uppercase text-(--primary)">
                                            {row.label}
                                        </div>
                                        <div className="font-Google-Sans leading-relaxed text-(--foreground)/75">
                                            <p>{row.description}</p>
                                            {row.notes && (
                                                <ul className="mt-2 space-y-1 text-sm text-(--foreground)/55">
                                                    {row.notes.map(note => (
                                                        <li key={note}>* {note}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {currentSection.examples && (
                            <div className="space-y-3">
                                {currentSection.examples.map(example => (
                                    <div key={example.label} className="border border-(--primary)/20 bg-black/20 p-3">
                                        <div className="mb-2 font-Google-Code uppercase tracking-widest text-(--primary)">
                                            {example.label}
                                        </div>
                                        <pre className="overflow-x-auto whitespace-pre-wrap font-Google-Code leading-relaxed text-(--foreground)/80">
                                            {example.code}
                                        </pre>
                                        {example.description && (
                                            <p className="mt-2 font-Google-Sans text-sm leading-relaxed text-(--foreground)/50">
                                                {example.description}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            </main>

            {selectedImage && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-label={selectedImage.alt}
                    onClick={closeImage}
                >
                    <button
                        type="button"
                        className="absolute right-4 top-4 border border-(--primary)/50 bg-(--background) px-3 py-2 font-Google-Code text-xs uppercase text-(--primary) transition-colors hover:bg-(--primary) hover:text-black cursor-pointer"
                        onClick={(event) => {
                            event.stopPropagation();
                            closeImage();
                        }}
                    >
                        Close
                    </button>

                    <div className="absolute left-4 top-4 flex items-center gap-1 border border-(--primary)/40 bg-(--background) p-1 font-Google-Code text-xs text-(--primary)">
                        <button
                            type="button"
                            className="h-8 w-8 cursor-pointer border border-(--primary)/30 transition-colors hover:bg-(--primary) hover:text-black"
                            onClick={(event) => {
                                event.stopPropagation();
                                updateImageZoom(imageZoom - 0.25);
                            }}
                            aria-label="Zoom out"
                        >
                            -
                        </button>
                        <button
                            type="button"
                            className="h-8 min-w-14 cursor-pointer border border-(--primary)/30 px-2 transition-colors hover:bg-(--primary) hover:text-black"
                            onClick={(event) => {
                                event.stopPropagation();
                                updateImageZoom(1);
                            }}
                            aria-label="Reset zoom"
                        >
                            {Math.round(imageZoom * 100)}%
                        </button>
                        <button
                            type="button"
                            className="h-8 w-8 cursor-pointer border border-(--primary)/30 transition-colors hover:bg-(--primary) hover:text-black"
                            onClick={(event) => {
                                event.stopPropagation();
                                updateImageZoom(imageZoom + 0.25);
                            }}
                            aria-label="Zoom in"
                        >
                            +
                        </button>
                    </div>

                    <figure
                        className="flex max-h-full max-w-[min(1200px,100%)] flex-col gap-2 pt-12"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div
                            ref={imageScrollRef}
                            className={`min-h-0 overflow-auto border border-(--primary)/40 bg-(--background) p-2 ${imageZoom > 1 ? 'cursor-grab active:cursor-grabbing select-none' : ''}`}
                            onWheel={handleImageWheel}
                            onMouseDown={handleImageMouseDown}
                            onMouseMove={handleImageMouseMove}
                            onMouseUp={stopImageDrag}
                            onMouseLeave={stopImageDrag}
                            style={{ touchAction: 'pan-x pan-y pinch-zoom' }}
                        >
                            <Image
                                src={selectedImage.src}
                                alt={selectedImage.alt}
                                width={selectedImage.width}
                                height={selectedImage.height}
                                draggable={false}
                                className={`h-auto object-contain ${imageZoom === 1 ? 'max-h-[82vh] max-w-full cursor-zoom-in' : 'max-w-none cursor-grab active:cursor-grabbing'}`}
                                style={{ width: `${selectedImage.width * imageZoom}px` }}
                                onDragStart={(event) => event.preventDefault()}
                                onClick={toggleImageZoom}
                            />
                        </div>
                        <figcaption className="font-Google-Sans text-sm leading-relaxed text-(--foreground)/60">
                            {selectedImage.alt}
                            <span className="ml-2 font-Google-Code text-[10px] uppercase text-(--foreground)/35">
                                Click or scroll to zoom. Drag when zoomed.
                            </span>
                        </figcaption>
                    </figure>
                </div>
            )}
        </div>
    );
}
