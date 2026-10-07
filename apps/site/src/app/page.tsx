import { Carousel } from '@/components/Carousel';
import { Demo } from '@/components/Demo';
import { Faq } from '@/components/Faq';
import { Features } from '@/components/Features';
import { FilmSection } from '@/components/FilmSection';
import { FinalCta } from '@/components/FinalCta';
import { Footer } from '@/components/Footer';
import { Hero } from '@/components/Hero';
import { HowItWorks } from '@/components/HowItWorks';
import { Marquee } from '@/components/Marquee';
import { Nav } from '@/components/Nav';
import { Pricing } from '@/components/Pricing';
import { Roles } from '@/components/Roles';
import { ScrollEffects } from '@/components/ScrollEffects';
import { DownloadBar } from '@/components/StoreButtons';

export default function Home() {
  return (
    <>
      <div className="progress" aria-hidden="true" />
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <FilmSection />
        <Demo />
        <Features />
        <Carousel />
        <Roles />
        <HowItWorks />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
      <DownloadBar />
      <ScrollEffects />
    </>
  );
}
