"""Text extraction from supported file types."""
import os
import io
from typing import Optional


def extract_text(path: str) -> Optional[str]:
    """Extract plain text from a supported file. Returns None on failure."""
    ext = os.path.splitext(path)[1].lower()
    try:
        if ext in {'.txt', '.md', '.py', '.js', '.jsx', '.ts', '.tsx',
                   '.json', '.yaml', '.yml', '.toml', '.html', '.css', '.csv'}:
            return _read_text_file(path)
        elif ext == '.pdf':
            return _extract_pdf(path)
        elif ext == '.docx':
            return _extract_docx(path)
    except Exception:
        return None
    return None


def _read_text_file(path: str) -> str:
    for enc in ('utf-8', 'utf-8-sig', 'latin-1'):
        try:
            with open(path, 'r', encoding=enc) as f:
                return f.read()
        except UnicodeDecodeError:
            continue
    return ''


def _extract_pdf(path: str) -> str:
    try:
        import pypdf
        reader = pypdf.PdfReader(path)
        return '\n'.join(p.extract_text() or '' for p in reader.pages)
    except ImportError:
        pass
    try:
        import pdfplumber
        with pdfplumber.open(path) as pdf:
            return '\n'.join(p.extract_text() or '' for p in pdf.pages)
    except ImportError:
        pass
    return ''


def _extract_docx(path: str) -> str:
    try:
        import docx
        doc = docx.Document(path)
        return '\n'.join(p.text for p in doc.paragraphs)
    except ImportError:
        return ''
