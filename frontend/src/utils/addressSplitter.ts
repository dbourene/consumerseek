export interface SplitAddress {
  street: string;
  postalCode: string;
  city: string;
}

export function splitFullAddress(fullAddress: string): SplitAddress {
  const trimmed = fullAddress.trim();

  const regex = /^(.+?),\s*(\d{5})\s+(.+)$/;
  const match = trimmed.match(regex);

  if (match) {
    return {
      street: match[1].trim(),
      postalCode: match[2].trim(),
      city: match[3].trim()
    };
  }

  const fallbackRegex = /^(.+?),\s*(.+?)$/;
  const fallbackMatch = trimmed.match(fallbackRegex);

  if (fallbackMatch) {
    const firstPart = fallbackMatch[1].trim();
    const secondPart = fallbackMatch[2].trim();

    const postalCodeMatch = secondPart.match(/^(\d{5})\s+(.+)$/);
    if (postalCodeMatch) {
      return {
        street: firstPart,
        postalCode: postalCodeMatch[1],
        city: postalCodeMatch[2].trim()
      };
    }

    const reversedMatch = secondPart.match(/^(.+?)\s+(\d{5})$/);
    if (reversedMatch) {
      return {
        street: firstPart,
        city: reversedMatch[1].trim(),
        postalCode: reversedMatch[2]
      };
    }
  }

  return {
    street: trimmed,
    postalCode: '',
    city: ''
  };
}
