import { CopyRight } from '../components/Copyright';
import { Features } from '../components/Features';
import { Hero } from '../components/Hero';
import { HomeFooter } from '../components/HomeFooter';

export function HomeLayout() {
  return (
    <>
      <Hero />
      <Features />
      <HomeFooter />
      <CopyRight />
    </>
  );
}
