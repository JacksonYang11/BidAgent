"""Isolated PDF extraction. Stdout carries progress events, never document text."""
import argparse
import json
import math
import os
from pathlib import Path

import fitz


def compact(text):
    return ''.join(text.split())


def extract(source, destination, max_pages=150, ocr_enabled=True):
    doc = fitz.open(source)
    if doc.needs_pass or not 0 < len(doc) <= max_pages:
        raise ValueError('PDF_ENCRYPTED_OR_PAGE_LIMIT')
    destination = Path(destination)
    pages = json.loads(destination.read_text()) if destination.exists() else []
    engine = None
    for index in range(len(pages), len(doc)):
        page = doc[index]
        if not 10 <= page.rect.width <= 10000 or not 10 <= page.rect.height <= 10000:
            raise ValueError('PDF_PAGE_DIMENSIONS')
        warnings, blocks = [], []
        for item in page.get_text('blocks', sort=True):
            if item[6] == 0 and item[4].strip():
                # Keep evidence blocks bounded, including unusually large text objects.
                text = item[4].strip()
                for start in range(0, len(text), 3500):
                    blocks.append({'text': text[start:start+3500], 'bbox': list(item[:4]),
                                   'kind': 'paragraph', 'method': 'text'})
        text_count = sum(len(compact(b['text'])) for b in blocks)
        images = page.get_image_info()
        if len(images) > 500:
            raise ValueError('PDF_IMAGE_LIMIT')
        visible_images = [im for im in images if (fitz.Rect(im['bbox']) & page.rect).get_area() > page.rect.get_area() * .015]
        needs_ocr = text_count < 30 or bool(visible_images) or any('\ufffd' in b['text'] for b in blocks)
        if needs_ocr and not ocr_enabled:
            warnings.append('本页有扫描或图片内容，OCR 未启用，解析不完整。')
        elif needs_ocr:
            print(json.dumps({'stage': 'ocr', 'completed': index, 'total': len(doc)}), flush=True)
            if engine is None:
                from rapidocr_onnxruntime import RapidOCR
                engine = RapidOCR(intra_op_num_threads=2, inter_op_num_threads=1)
            scale = min(2.5, math.sqrt(10_000_000 / page.rect.get_area()))
            native = compact('\n'.join(b['text'] for b in blocks))
            grouped = []
            regions = [page.rect]
            if text_count >= 30 and visible_images:
                regions = [fitz.Rect(im['bbox']) & page.rect for im in visible_images]
                # Adjacent screenshot panels can overlap in slides. Read only each
                # panel's visible portion, never merge cells across those panels.
                for n, rect in enumerate(regions):
                    for later in regions[n+1:]:
                        if later.x0 > rect.x0 and abs(later.y0-rect.y0) < 10 and later.x0 < rect.x1:
                            rect.x1 = later.x0
            recognized = False
            for region_number, rect in enumerate(regions):
                if rect.is_empty:
                    continue
                pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=rect, alpha=False)
                result, _ = engine(pix.tobytes('png'))
                recognized = recognized or bool(result)
                rows = []
                for box, text, confidence in result or []:
                    if len(compact(text)) > 1 and compact(text) in native:
                        continue
                    xs = [p[0]/scale+rect.x0 for p in box]
                    ys = [p[1]/scale+rect.y0 for p in box]
                    rows.append({'text': text, 'bbox': [min(xs),min(ys),max(xs),max(ys)],
                                 'kind': 'ocr_line', 'method': 'ocr', 'region': region_number,
                                 'confidence': round(float(confidence),3)})
                baselines = []
                for row in sorted(rows, key=lambda r: (r['bbox'][1], r['bbox'][0])):
                    if baselines and abs(baselines[-1][0]['bbox'][1]-row['bbox'][1]) < 5:
                        baselines[-1].append(row)
                    else:
                        baselines.append([row])
                for cells in baselines:
                    cells.sort(key=lambda r:r['bbox'][0])
                    grouped.append({'text':' | '.join(c['text'] for c in cells),
                        'bbox':[min(c['bbox'][0] for c in cells),min(c['bbox'][1] for c in cells),
                                max(c['bbox'][2] for c in cells),max(c['bbox'][3] for c in cells)],
                        'kind':'ocr_row','method':'ocr','region':region_number,
                        'confidence':min(c['confidence'] for c in cells)})
            blocks.extend(grouped)
            if not recognized:
                warnings.append('图片区域未识别到文字，请人工核对。')
            if any(r['confidence'] < .8 for r in grouped):
                warnings.append('部分 OCR 文字识别质量较低，数字及表格需要核对。')
            if grouped:
                warnings.append('本页包含 OCR 内容；引用匹配不代表识别文字已人工核实。')
        if text_count >= 30 and not visible_images:
            try:
                for table in page.find_tables().tables:
                    for row in table.extract():
                        cells = [str(cell or '').strip() for cell in row]
                        if any(cells):
                            blocks.append({'text': ' | '.join(cells), 'cells': cells,
                                           'bbox': list(table.bbox), 'kind': 'table_row', 'method': 'text'})
            except Exception:
                warnings.append('表格结构恢复未完成，已保留文字，请核对行列关系。')
        blocks.sort(key=lambda b: (b['bbox'][1], b['bbox'][0]))
        for number, block in enumerate(blocks):
            block.update({'id': f'p{index+1}-b{number+1}', 'page': index+1})
        if not blocks:
            warnings.append('本页没有可解析内容。')
        pages.append({'page': index+1, 'width': page.rect.width, 'height': page.rect.height,
                      'blocks': blocks, 'warnings': warnings, 'ocr': needs_ocr and ocr_enabled})
        temp = destination.with_suffix('.pending')
        temp.write_text(json.dumps(pages, ensure_ascii=False), encoding='utf-8')
        os.replace(temp, destination)
        print(json.dumps({'stage': 'extracting', 'completed': index+1, 'total': len(doc)}), flush=True)
    doc.close()
    return pages


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    parser.add_argument('destination')
    parser.add_argument('--max-pages', type=int, default=150)
    parser.add_argument('--no-ocr', action='store_true')
    args = parser.parse_args()
    try:
        extract(args.source, args.destination, args.max_pages, not args.no_ocr)
    except Exception:
        print(json.dumps({'error': 'PDF_EXTRACTION_FAILED'}), flush=True)
        raise SystemExit(1)
