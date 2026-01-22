export function fixEncodingIssues(text: string | null | undefined): string {
  if (!text) return '';

  const replacements: Record<string, string> = {
    'Ã©': 'é',
    'Ã¨': 'è',
    'Ãª': 'ê',
    'Ã«': 'ë',
    'Ã ': 'à',
    'Ã¢': 'â',
    'Ã´': 'ô',
    'Ã¹': 'ù',
    'Ã»': 'û',
    'Ã§': 'ç',
    'Ã®': 'î',
    'Ã¯': 'ï',
    'Ã‰': 'É',
    'Ãˆ': 'È',
    'ÃŠ': 'Ê',
    'Ã‹': 'Ë',
    'Ã€': 'À',
    'Ã‚': 'Â',
    'Ã"': 'Ô',
    'Ã™': 'Ù',
    'Ã›': 'Û',
    'Ã‡': 'Ç',
    'ÃŽ': 'Î',
    'Ã': 'Ï',
    'â€™': "'",
    'â€˜': "'",
    'â€œ': '"',
    'â€': '"',
    'â€"': '–',
  };

  let fixedText = text;

  for (const [wrong, correct] of Object.entries(replacements)) {
    fixedText = fixedText.replace(new RegExp(wrong, 'g'), correct);
  }

  return fixedText;
}
