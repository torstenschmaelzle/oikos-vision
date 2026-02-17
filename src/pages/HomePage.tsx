import { useRef, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform, useInView } from "framer-motion";
import { ArrowRight, Sun, MapPin, BarChart3, Zap, Globe, Shield, Leaf, TrendingUp } from "lucide-react";
import heroVideo from "@/assets/hero-video.mp4";
import heroPoster from "@/assets/hero-poster.jpg";

function AnimatedCounter({ target, suffix = "", duration = 2 }: { target: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = target / (duration * 60);
    const id = setInterval(() => {
      start += step;
      if (start >= target) {
        setCount(target);
        clearInterval(id);
      } else {
        setCount(Math.floor(start));
      }
    }, 1000 / 60);
    return () => clearInterval(id);
  }, [inView, target, duration]);

  return (
    <span ref={ref} className="font-display font-bold text-4xl md:text-5xl text-gradient tabular-nums">
      {count.toLocaleString()}{suffix}
    </span>
  );
}

function ScrollSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const cards = [
  { icon: Sun, title: "Solar Potential", desc: "Explore the solar energy potential of every rooftop across Swiss municipalities." },
  { icon: MapPin, title: "Precise Location", desc: "Navigate to any canton, gemeinde, and individual building with live data." },
  { icon: BarChart3, title: "Energy Insights", desc: "Analyze summer and winter energy yields, roof areas, and building details." },
];

const scrollSections = [
  { icon: Globe, title: "Our Mission", text: "Oikos Solar makes Switzerland's solar potential transparent and accessible. We believe in data-driven energy decisions for a sustainable future.", color: "from-primary/20 to-accent/30" },
  { icon: Zap, title: "Live Data, Real Impact", text: "Every data point comes from official sources. From roof geometries to energy yield estimates, our platform provides trusted, up-to-date information.", color: "from-accent/20 to-primary/10" },
  { icon: Shield, title: "How It Works", text: "Select a canton, pick a gemeinde, and explore individual buildings. Filter by roof area, energy potential, and more to find the best solar opportunities.", color: "from-primary/10 to-accent/20" },
  { icon: BarChart3, title: "What You Can Explore", text: "View building locations on an interactive map, inspect roof part geometries, compare summer and winter kWh yields, and identify high-potential sites at a glance.", color: "from-accent/30 to-primary/20" },
];

export default function HomePage() {
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 150]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, 1.1]);

  const [videoFailed, setVideoFailed] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const showVideo = !prefersReducedMotion && !videoFailed;

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* Hero with video background */}
      <section ref={heroRef} className="relative min-h-[100vh] flex items-center justify-center overflow-hidden">
        {/* Video / animated background */}
        <motion.div style={{ scale: heroScale }} className="absolute inset-0 z-0">
          {showVideo ? (
            <video
              autoPlay
              loop
              muted
              playsInline
              poster={heroPoster}
              onError={() => setVideoFailed(true)}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ willChange: "transform" }}
            >
              <source src={heroVideo} type="video/mp4" />
            </video>
          ) : prefersReducedMotion ? (
            <img src={heroPoster} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            /* Animated gradient fallback */
            <div className="absolute inset-0 hero-animated-gradient" />
          )}
        </motion.div>

        {/* Dark green overlay + vignette */}
        <div className="absolute inset-0 z-[1] bg-gradient-to-b from-[hsl(150,30%,8%,0.55)] via-[hsl(150,20%,10%,0.4)] to-[hsl(150,30%,8%,0.7)]" />
        <div className="absolute inset-0 z-[1] hero-vignette" />

        {/* Hero content */}
        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          className="relative z-[2] max-w-5xl mx-auto px-6 text-center"
        >
          <motion.div
            initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="inline-block mb-5 px-5 py-2 rounded-full text-xs font-semibold uppercase tracking-widest bg-white/10 text-white/90 backdrop-blur-md border border-white/10">
              Swiss Solar Intelligence
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 40, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 1, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="font-display font-bold text-5xl md:text-7xl lg:text-8xl leading-[1.05] mb-6 text-white drop-shadow-lg"
          >
            Unlock Switzerland's
            <br />
            <span className="hero-text-gradient">Solar Potential</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.9, delay: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="text-lg md:text-xl text-white/75 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            Explore rooftop solar data for every building across Swiss cantons and municipalities.
            Make smarter energy decisions with real-time insights.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
          >
            <Link
              to="/map"
              className="inline-flex items-center gap-2.5 px-9 py-4.5 rounded-2xl font-semibold text-primary-foreground gradient-primary shadow-glow hover:shadow-elevated transition-all duration-300 hover:scale-[1.04] text-base"
            >
              Explore Map
              <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5, duration: 1 }}
            className="absolute -bottom-20 left-1/2 -translate-x-1/2"
          >
            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
              className="w-6 h-10 rounded-full border-2 border-white/30 flex items-start justify-center p-1.5"
            >
              <div className="w-1.5 h-3 rounded-full bg-white/50" />
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      {/* Stats */}
      <section className="relative py-20 border-b border-border/50 overflow-hidden">
        <div className="absolute inset-0 topo-pattern opacity-30" />
        <div className="relative max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-10 text-center">
          {[
            { target: 26, suffix: "", label: "Cantons Covered", icon: Leaf },
            { target: 2148, suffix: "+", label: "Municipalities", icon: MapPin },
            { target: 500, suffix: "K+", label: "Buildings Analyzed", icon: TrendingUp },
          ].map((s, i) => (
            <ScrollSection key={s.label}>
              <div className="relative p-6 rounded-2xl glass border border-border/50">
                <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-glow">
                  <s.icon className="w-5 h-5 text-primary-foreground" />
                </div>
                <AnimatedCounter target={s.target} suffix={s.suffix} />
                <p className="mt-3 text-sm text-muted-foreground font-medium">{s.label}</p>
              </div>
            </ScrollSection>
          ))}
        </div>
      </section>

      {/* Info Cards */}
      <section className="relative py-24 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-accent/5 to-background" />
        {/* Animated blob */}
        <div className="absolute top-20 -right-32 w-[500px] h-[500px] rounded-full bg-primary/5 blur-[100px] animated-blob" />
        <div className="absolute bottom-20 -left-32 w-[400px] h-[400px] rounded-full bg-accent/10 blur-[80px] animated-blob-2" />

        <div className="relative max-w-5xl mx-auto">
          <ScrollSection className="text-center mb-16">
            <h2 className="font-display font-bold text-3xl md:text-5xl text-foreground mb-5">
              Everything You Need
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto text-base">
              A comprehensive solar analytics platform built on real Swiss federal data.
            </p>
          </ScrollSection>

          <div className="grid md:grid-cols-3 gap-7">
            {cards.map((card, i) => (
              <ScrollSection key={card.title}>
                <motion.div
                  whileHover={{ y: -6, boxShadow: "var(--shadow-elevated)" }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  className="group p-7 rounded-2xl border border-border/50 gradient-card shadow-soft relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative">
                    <div className="w-13 h-13 rounded-xl gradient-primary flex items-center justify-center mb-5 shadow-glow group-hover:scale-110 transition-transform duration-300">
                      <card.icon className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <h3 className="font-display font-semibold text-lg mb-2.5 text-foreground">{card.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{card.desc}</p>
                  </div>
                </motion.div>
              </ScrollSection>
            ))}
          </div>
        </div>
      </section>

      {/* Scroll Stack Sections */}
      <section className="relative py-24 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-muted/30" />
        <div className="absolute inset-0 topo-pattern opacity-20" />
        <div className="absolute inset-0 noise-overlay" />

        <div className="relative max-w-3xl mx-auto space-y-8">
          <ScrollSection className="text-center mb-8">
            <h2 className="font-display font-bold text-3xl md:text-4xl text-foreground mb-4">How Oikos Solar Works</h2>
            <p className="text-muted-foreground">From data to decisions, in a few clicks.</p>
          </ScrollSection>

          {scrollSections.map((s, i) => (
            <ScrollSection key={s.title}>
              <motion.div
                whileHover={{ x: 4 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className={`flex items-start gap-6 p-6 rounded-2xl bg-gradient-to-r ${s.color} border border-border/30 backdrop-blur-sm`}
              >
                <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center shrink-0 shadow-glow">
                  <s.icon className="w-7 h-7 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-xl text-foreground mb-2">{s.title}</h3>
                  <p className="text-muted-foreground leading-relaxed text-sm">{s.text}</p>
                </div>
              </motion.div>
            </ScrollSection>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-28 px-6 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-accent/8 to-background" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px]" />

        <ScrollSection className="relative max-w-2xl mx-auto">
          <h2 className="font-display font-bold text-3xl md:text-5xl text-foreground mb-5">
            Ready to Explore?
          </h2>
          <p className="text-muted-foreground mb-10 text-base">
            Dive into Switzerland's most comprehensive solar rooftop database.
          </p>
          <Link
            to="/map"
            className="inline-flex items-center gap-2.5 px-9 py-4.5 rounded-2xl font-semibold text-primary-foreground gradient-primary shadow-glow hover:shadow-elevated transition-all duration-300 hover:scale-[1.04] text-base"
          >
            Open the Map
            <ArrowRight className="w-5 h-5" />
          </Link>
        </ScrollSection>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-10 px-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Oikos Solar · Built with Swiss precision
      </footer>
    </div>
  );
}
