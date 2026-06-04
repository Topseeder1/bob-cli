import chalk from 'chalk';

export function renderMarkdown(text: string): string {
  return text
    // Headers → bold colored text (order matters: longest match first)
    .replace(/^#{1,6}\s+(.+)$/gm, chalk.bold.cyan('$1'))
    // Bold → chalk bold
    .replace(/\*\*(.+?)\*\*/g, chalk.bold('$1'))
    // Italic → chalk italic (single asterisk not at line start)
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, chalk.italic('$1'))
    // Bullet points → clean dots
    .replace(/^\s*[\*\-]\s+/gm, '  • ')
    // Numbered lists → clean up
    .replace(/^\s*(\d+)\.\s+/gm, '  $1. ')
    // Horizontal rules → thin line
    .replace(/^[\-\*]{3,}$/gm, chalk.gray('─'.repeat(60)))
    // Inline code → highlighted
    .replace(/`([^`]+)`/g, chalk.yellow('$1'))
    // Code blocks → just remove the fences
    .replace(/```[\w]*\n?/g, '')
    // Clean up excessive blank lines
    .replace(/\n{3,}/g, '\n\n');
}