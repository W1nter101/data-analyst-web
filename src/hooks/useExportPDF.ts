'use client';

import domtoimage from 'dom-to-image-more';
import jsPDF from 'jspdf';
import { useState, useCallback, RefObject } from 'react';

interface ExportOptions {
  filename?: string;
}

export function useExportPDF() {
  const [isExporting, setIsExporting] = useState(false);

  const exportToPDF = useCallback(
    async (
      targetRef: RefObject<HTMLElement | null>,
      options: ExportOptions = {}
    ) => {
      const element = targetRef.current;
      if (!element || isExporting) return;

      const filename = options.filename ?? 'dashboard.pdf';
      setIsExporting(true);

      // === PRE-CAPTURE FIXES ===

      // Fix 1: Ẩn no-print bằng display:none (drag handles là position:absolute, không ảnh hưởng layout)
      const noPrintEls = Array.from(
        element.querySelectorAll<HTMLElement>('.no-print')
      );
      noPrintEls.forEach((el) => {
        el.style.display = 'none';
      });

      // Fix 2: Inline hóa border-color (dom-to-image không đọc CSS variables)
      // Chỉ thực hiện trên những phần tử có border width thực tế để tránh lỗi viền trắng thừa trên text/svg
      const borderedEls = Array.from(
        element.querySelectorAll<HTMLElement>('*')
      );
      borderedEls.forEach((el) => {
        const computed = getComputedStyle(el);
        const borderTop = parseFloat(computed.borderTopWidth) || 0;
        const borderRight = parseFloat(computed.borderRightWidth) || 0;
        const borderBottom = parseFloat(computed.borderBottomWidth) || 0;
        const borderLeft = parseFloat(computed.borderLeftWidth) || 0;

        const hasBorder =
          (borderTop > 0 && computed.borderTopStyle !== 'none') ||
          (borderRight > 0 && computed.borderRightStyle !== 'none') ||
          (borderBottom > 0 && computed.borderBottomStyle !== 'none') ||
          (borderLeft > 0 && computed.borderLeftStyle !== 'none');

        if (hasBorder) {
          const bc = computed.borderColor;
          if (bc && bc !== 'rgba(0, 0, 0, 0)') {
            el.dataset.origBorder = el.style.borderColor;
            el.style.borderColor = bc; // inline computed value
          }
        }
      });

      // Fix 3: Bỏ truncate trên title để hiện đầy đủ
      const truncatedEls = Array.from(
        element.querySelectorAll<HTMLElement>('[class*="truncate"], .widget-title')
      );
      truncatedEls.forEach((el) => {
        el.dataset.origOverflow = el.style.overflow;
        el.dataset.origTextOverflow = el.style.textOverflow;
        el.style.overflow = 'visible';
        el.style.textOverflow = 'clip';
      });

      try {
        const scale = 2;
        const width = element.scrollWidth;
        const height = element.scrollHeight;

        // dom-to-image-more capture toàn bộ DOM kể cả SVG
        const dataUrl = await domtoimage.toPng(element, {
          width: width * scale,
          height: height * scale,
          style: {
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            width: `${width}px`,
            height: `${height}px`,
          },
          bgcolor: '#16161a',
          // Capture đúng kích thước scroll, không clip viewport
          scrollFix: true,
        });

        // Tạo PDF khớp kích thước content
        const pdf = new jsPDF({
          orientation: width > height ? 'landscape' : 'portrait',
          unit: 'px',
          format: [width, height],
        });

        pdf.addImage(dataUrl, 'PNG', 0, 0, width, height);
        pdf.save(filename);
      } catch (err) {
        console.error('[exportPDF] failed:', err);
        throw err;
      } finally {
        // === POST-CAPTURE RESTORE ===
        noPrintEls.forEach((el) => {
          el.style.display = '';
        });
        borderedEls.forEach((el) => {
          if (el.dataset.origBorder !== undefined) {
            el.style.borderColor = el.dataset.origBorder;
            delete el.dataset.origBorder;
          }
        });
        truncatedEls.forEach((el) => {
          el.style.overflow = el.dataset.origOverflow ?? '';
          el.style.textOverflow = el.dataset.origTextOverflow ?? '';
          delete el.dataset.origOverflow;
          delete el.dataset.origTextOverflow;
        });
        setIsExporting(false);
      }
    },
    [isExporting]
  );

  return { exportToPDF, isExporting };
}
