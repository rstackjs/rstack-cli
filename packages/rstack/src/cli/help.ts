import { color } from 'rslog';

declare global {
  const RSTACK_VERSION: string;
}

export type HelpItem = readonly [label: string, description: string];

export type HelpSection =
  | {
      title: string;
      items: readonly HelpItem[];
    }
  | {
      content: string;
      dim?: boolean;
    };

export type HelpDefinition = {
  usage: string;
  description?: string;
  sections?: readonly HelpSection[];
};

export const hasHelpFlag = (args: readonly string[]): boolean => {
  const end = args.indexOf('--');
  const flags = end === -1 ? args : args.slice(0, end);

  return flags.some((flag) => flag === '-h' || flag === '--help');
};

const renderItems = (items: readonly HelpItem[]): string => {
  const labelWidth = items.reduce((width, [label]) => Math.max(width, label.length), 0);

  return items
    .map(([label, description]) => `  ${label.padEnd(labelWidth)}  ${description}`)
    .join('\n');
};

const renderSection = (section: HelpSection): string => {
  if ('items' in section) {
    return `${color.cyan(section.title)}:\n${renderItems(section.items)}`;
  }

  return section.dim ? color.dim(section.content) : section.content;
};

export const renderHelp = ({ usage, description, sections = [] }: HelpDefinition): string => {
  const blocks = [
    color.bold(`Rstack v${RSTACK_VERSION}`),
    `${color.cyan('Usage')}:\n${color.yellow(`  $ ${usage}`)}`,
  ];

  if (description) {
    blocks.push(description);
  }

  blocks.push(...sections.map(renderSection));

  return blocks.join('\n\n');
};
