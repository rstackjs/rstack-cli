import { useLang, usePages } from '@rspress/core/runtime';
import { Link, renderInlineMarkdown } from '@rspress/core/theme';
import type { BlogAvatarAuthor } from '@rstackjs/doc-ui/blog-avatar';
import { BlogBackground } from '@rstackjs/doc-ui/blog-background';
import {
  BlogList as BaseBlogList,
  type BlogListItem,
} from '@rstackjs/doc-ui/blog-list';

type BlogFrontmatter = {
  description?: string;
  date?: string;
  authors?: BlogAvatarAuthor[];
};

const getDateValue = (date?: BlogListItem['date']): number => {
  const timestamp = date ? new Date(date).getTime() : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

export function BlogList() {
  const { pages } = usePages();
  const lang = useLang();
  const posts = pages
    .filter(
      (page) =>
        page.lang === lang &&
        page.routePath.includes('/blog/') &&
        !page.routePath.endsWith('/blog/'),
    )
    .map((page): BlogListItem => {
      const frontmatter = (page.frontmatter ?? {}) as BlogFrontmatter;

      return {
        title: page.title,
        description: frontmatter.description,
        date: frontmatter.date,
        href: page.routePath,
        authors: frontmatter.authors,
      };
    })
    .sort((a, b) => getDateValue(b.date) - getDateValue(a.date));

  return (
    <>
      <BaseBlogList
        posts={posts}
        lang={lang}
        LinkComp={Link}
        renderInlineMarkdown={renderInlineMarkdown}
      />
      <BlogBackground />
    </>
  );
}
