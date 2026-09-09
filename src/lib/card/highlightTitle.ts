export type TitleToken = Readonly<{ text: string; highlighted: boolean }>;

export function titleFontSize(title: string): number {
  const count = title.trim() ? title.trim().split(/\s+/u).length : 0;
  if (count > 20) return 44;
  if (count > 15) return 52;
  if (count > 10) return 60;
  return 75;
}

export function tokenizeTitle(title: string): TitleToken[][] {
  return title.split(/\r?\n/u).map((line) => tokenizeLine(line));
}

function tokenizeLine(line: string): TitleToken[] {
  const hasPair = /\*[^*]+\*/u.test(line);
  if (hasPair) {
    const parts = line.split(/(\*[^*]+\*)/u);
    return parts.filter(Boolean).map((part) => part.startsWith('*') && part.endsWith('*')
      ? { text: part.slice(1, -1), highlighted: true }
      : { text: part, highlighted: false });
  }
  const words = line.match(/\S+|\s+/gu) ?? [];
  const realWords = words.filter((word) => !/^\s+$/u.test(word));
  const start = Math.floor(realWords.length * 0.3);
  const end = Math.floor(realWords.length * 0.7);
  let index = 0;
  return words.map((word) => {
    const whitespace = /^\s+$/u.test(word);
    const highlighted = !whitespace && realWords.length > 3 && index >= start && index <= end;
    if (!whitespace) index += 1;
    return { text: word, highlighted };
  });
}
