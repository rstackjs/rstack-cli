import { Commands } from '../components/Commands';
import { CopyRight } from '../components/Copyright';
import { GetStarted } from '../components/GetStarted';
import { Hero } from '../components/Hero';
import { HomeFooter } from '../components/HomeFooter';

export function HomeLayout() {
  return (
    <>
      <Hero />
      <Commands />
      <GetStarted />
      <HomeFooter />
      <CopyRight />
    </>
  );
}
