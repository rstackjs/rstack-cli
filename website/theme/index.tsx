import { useLang, usePage } from '@rspress/core/runtime';
import {
  Layout as BaseLayout,
  DocLayout as BaseDocLayout,
  Link,
  type DocLayoutProps,
} from '@rspress/core/theme-original';
import { BlogBackButton } from '@rstackjs/doc-ui/blog-back-button';
import { NavIcon } from '@rstackjs/doc-ui/nav-icon';
import { HomeLayout } from './pages';
import '@rstackjs/doc-ui/theme.css';
import './index.scss';

const Layout = () => <BaseLayout beforeNavTitle={<NavIcon />} />;

const DocLayout = (props: DocLayoutProps) => {
  const { page } = usePage();
  const lang = useLang();

  return (
    <BaseDocLayout
      {...props}
      beforeDocContent={
        <>
          <BlogBackButton
            pathname={page.routePath}
            lang={lang}
            LinkComp={Link}
          />
          {props.beforeDocContent}
        </>
      }
    />
  );
};

export { DocLayout, HomeLayout, Layout };

export * from '@rspress/core/theme-original';
