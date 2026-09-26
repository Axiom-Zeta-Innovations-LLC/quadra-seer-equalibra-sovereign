
import { FileData } from '../types';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_EXTRACTED_TEXT = 12000;

const TEXT_EXTENSIONS = new Set([
    'txt', 'md', 'csv', 'json', 'xml', 'yaml', 'yml', 'log', 'ini',
    'py', 'js', 'ts', 'tsx', 'jsx', 'html', 'css', 'sql'
]);

const truncateText = (text: string, maxLength: number = MAX_EXTRACTED_TEXT): string => {
    if (!text) return '';
    return text.length > maxLength ? `${text.slice(0, maxLength)}\n\n[TRUNCATED]` : text;
};

/**
 * Reads a File object and converts it into a base64 encoded string.
 */
const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const base64String = (reader.result as string).split(',')[1];
            if (!base64String) {
                reject(new Error("Failed to read file as base64."));
            } else {
                resolve(base64String);
            }
        };
        reader.onerror = error => reject(error);
    });
};

/**
 * Reads a File object as text.
 */
const fileToText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsText(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

const extractPdfText = async (file: File): Promise<string> => {
    const pdfjs = await import('pdfjs-dist');
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url
        ).toString();
    }

    const buffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
    const pdf = await loadingTask.promise;

    const pages: string[] = [];
    const pageLimit = Math.min(pdf.numPages, 30);
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = (content.items as Array<{ str?: string }>)
            .map(item => item.str || '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (text) {
            pages.push(`[Page ${pageNumber}] ${text}`);
        }
    }

    return truncateText(pages.join('\n\n'));
};

const extractZipSummary = async (file: File): Promise<string> => {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entries = Object.values(zip.files).filter(entry => !entry.dir);

    const lines: string[] = [];
    const extractionLimit = Math.min(entries.length, 40);

    for (let i = 0; i < extractionLimit; i++) {
        const entry = entries[i];
        const name = entry.name;
        const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
        lines.push(`- ${name}`);

        if (TEXT_EXTENSIONS.has(ext)) {
            try {
                const text = await entry.async('string');
                const cleaned = text.replace(/\0/g, '').trim();
                if (cleaned) {
                    lines.push(`  Preview: ${truncateText(cleaned, 600).replace(/\n/g, ' ')}`);
                }
            } catch {
                // Keep file listing even if preview extraction fails for this entry.
            }
        }
    }

    const header = `ZIP contains ${entries.length} file(s).`;
    return truncateText(`${header}\n${lines.join('\n')}`);
};

/**
 * Parses a File object into our custom FileData structure.
 */
export const parseFile = async (file: File): Promise<FileData> => {
    if (!file) {
        throw new Error("No file provided to parse.");
    }

    if (file.size > MAX_FILE_SIZE) {
        throw new Error(`File is too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.`);
    }

    const fileData: FileData = {
        name: file.name,
        type: file.type,
        size: file.size,
        content: '',
    };

    const extension = file.name.split('.').pop()?.toLowerCase();

    // Handle Word Documents
    if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || extension === 'docx') {
        const mammoth = (await import('mammoth')).default;
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        fileData.extractedText = truncateText(result.value);
        fileData.content = await fileToBase64(file);
    } 
    // Handle Excel Sheets
    else if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || extension === 'xlsx' || extension === 'xls' || extension === 'csv') {
        const XLSX = await import('xlsx');
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        let combinedText = '';
        workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            combinedText += `\n--- Sheet: ${sheetName} ---\n`;
            combinedText += XLSX.utils.sheet_to_csv(worksheet);
        });
        fileData.extractedText = truncateText(combinedText);
        fileData.content = await fileToBase64(file);
    }
    // Handle PDFs
    else if (file.type === 'application/pdf' || extension === 'pdf') {
        fileData.extractedText = await extractPdfText(file);
        fileData.content = await fileToBase64(file);
    }
    // Handle ZIP archives (with index + text previews when possible)
    else if (file.type === 'application/zip' || extension === 'zip') {
        fileData.extractedText = await extractZipSummary(file);
        fileData.content = await fileToBase64(file);
    }
    // Handle plain text and code-like files
    else if (file.type.startsWith('text/') || (extension ? TEXT_EXTENSIONS.has(extension) : false)) {
        fileData.extractedText = truncateText(await fileToText(file));
        fileData.content = await fileToBase64(file);
    }
    // Handle standard Gemini supported types (Images, PDF, Audio, Video)
    else {
        fileData.content = await fileToBase64(file);
    }

    return fileData;
};
