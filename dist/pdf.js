export async function extractPdf(bytes) {
  let pdf;
  try {
    pdf = await import(new URL('./vendor/pdf.min.mjs', import.meta.url).href);
  } catch {
    throw new Error('PDF 模块载入失败，请刷新后重试，或使用 TXT/CSV。');
  }
  pdf.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
  const task = pdf.getDocument({
    data: new Uint8Array(bytes), useWasm:false, isEvalSupported:false,
    disableFontFace:true, stopAtErrors:true,
    cMapUrl:new URL('./vendor/cmaps/', import.meta.url).href,
    standardFontDataUrl:new URL('./vendor/standard_fonts/', import.meta.url).href,
  });
  try {
    const doc = await task.promise;
    if (doc.numPages > 30) throw new Error('PDF 最多支持 30 页，请拆分后导入。');
    const pages = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const {items} = await page.getTextContent();
      let text = '', previousY;
      for (const item of items) {
        if (typeof item.str !== 'string') continue;
        const y = item.transform[5];
        if (previousY !== undefined && Math.abs(y - previousY) > 2 && !text.endsWith('\n')) text += '\n';
        text += item.str + (item.hasEOL ? '\n' : '');
        previousY = y;
      }
      if (!text.trim()) throw new Error('PDF 第 ' + pageNumber + ' 页没有可提取的文字，请先做 OCR 或转成 TXT。');
      pages.push(text.trim());
    }
    return pages.join('\n');
  } catch (error) {
    if (error.name === 'PasswordException') throw new Error('请先解锁 PDF，再重新导入。');
    throw error;
  } finally {
    await task.destroy();
  }
}
