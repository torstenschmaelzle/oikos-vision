import { useRef, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform, useInView } from "framer-motion";
import { ArrowRight, Sun, MapPin, BarChart3, Zap, Globe, Shield } from "lucide-react";

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

function ScrollSection({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const cards = [
  {
    icon: Sun,
    title: "Solar Potential",
    desc: "Explore the solar energy potential of every rooftop across Swiss municipalities.",
  },
  {
    icon: MapPin,
    title: "Precise Location",
    desc: "Navigate to any canton, gemeinde, and individual building with live data.",
  },
  {
    icon: BarChart3,
    title: "Energy Insights",
    desc: "Analyze summer and winter energy yields, roof areas, and building details.",
  },
];

const scrollSections = [
  {
    icon: Globe,
    title: "Our Mission",
    text: "Oikos Solar makes Switzerland's solar potential transparent and accessible. We believe in data-driven energy decisions for a sustainable future.",
  },
  {
    icon: Zap,
    title: "Live Data, Real Impact",
    text: "Every data point comes from official sources. From roof geometries to energy yield estimates, our platform provides trusted, up-to-date information.",
  },
  {
    icon: Shield,
    title: "How It Works",
    text: "Select a canton, pick a gemeinde, and explore individual buildings. Filter by roof area, energy potential, and more to find the best solar opportunities.",
  },
  {
    icon: BarChart3,
    title: "What You Can Explore",
    text: "View building locations on an interactive map, inspect roof part geometries, compare summer and winter kWh yields, and identify high-potential sites at a glance.",
  },
];

export default function HomePage() {
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  // Parallax for decorative elements
  const blob1Y = useTransform(scrollYProgress, [0, 1], [0, 60]);
  const blob2Y = useTransform(scrollYProgress, [0, 1], [0, -40]);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section ref={heroRef} className="relative overflow-hidden min-h-[90vh] flex items-center justify-center">
      {/* Layered background */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/8 via-accent/20 to-background" />
        <div className="absolute inset-0 topo-pattern opacity-60" />
        <div className="absolute inset-0 noise-overlay opacity-[0.04]" />

        {/* Radial hero glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] rounded-full bg-primary/20 blur-[150px]" />

        {/* Animated gradient blobs */}
        <motion.div style={{ y: blob1Y }} className="absolute -top-20 -right-32 w-[600px] h-[600px] rounded-full bg-primary/25 blur-[120px] animated-blob" />
        <motion.div style={{ y: blob2Y }} className="absolute -bottom-20 -left-32 w-[500px] h-[500px] rounded-full bg-primary/20 blur-[100px] animated-blob-2" />
        <motion.div style={{ y: blob1Y }} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] rounded-full bg-primary/15 blur-[130px] animated-blob" />
        <motion.div style={{ y: blob2Y }} className="absolute top-[20%] left-[15%] w-[300px] h-[300px] rounded-full bg-primary/18 blur-[90px] animated-blob-2" />

        {/* Shimmer lines */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent shimmer-line" />

        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          className="relative max-w-5xl mx-auto px-6 pt-32 pb-24 text-center"
        >
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
          >
            <span className="inline-block mb-4 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-primary/15 text-primary border border-primary/25">
              Swiss Solar Intelligence
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="font-display font-bold text-5xl md:text-7xl leading-tight mb-6 text-foreground"
          >
            Unlock Switzerland's
            <br />
            <span className="text-gradient">Solar Potential</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35 }}
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10"
          >
            Explore rooftop solar data for every building across Swiss cantons and municipalities.
            Make smarter energy decisions with real-time insights.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
          >
            <Link
              to="/map"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-primary-foreground gradient-primary shadow-glow hover:shadow-elevated transition-all duration-300 hover:scale-[1.03] ring-2 ring-primary/20 ring-offset-2 ring-offset-background"
            >
              Explore Map
              <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* Stats */}
      <section className="relative py-16 border-b border-primary/25">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/8 via-accent/18 to-primary/5" />
        <div className="absolute inset-0 noise-overlay opacity-[0.03]" />
        <div className="relative max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <ScrollSection>
            <AnimatedCounter target={26} />
            <p className="mt-2 text-sm text-muted-foreground">Cantons Covered</p>
          </ScrollSection>
          <ScrollSection>
            <AnimatedCounter target={2148} suffix="+" />
            <p className="mt-2 text-sm text-muted-foreground">Municipalities</p>
          </ScrollSection>
          <ScrollSection>
            <AnimatedCounter target={500} suffix="K+" />
            <p className="mt-2 text-sm text-muted-foreground">Buildings Analyzed</p>
          </ScrollSection>
        </div>
      </section>

      {/* Info Cards */}
      <section className="relative py-20 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-accent/15 to-primary/8" />
        <div className="absolute inset-0 topo-pattern opacity-35" />
        <div className="absolute inset-0 noise-overlay opacity-[0.03]" />
        <div className="absolute top-10 right-0 w-96 h-96 rounded-full bg-primary/20 blur-[100px] animated-blob-2" />
        <div className="absolute bottom-10 left-0 w-72 h-72 rounded-full bg-primary/18 blur-[80px] animated-blob" />
        <div className="relative max-w-5xl mx-auto">
          <ScrollSection className="text-center mb-14">
            <h2 className="font-display font-bold text-3xl md:text-4xl text-foreground mb-4">
              Everything You Need
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              A comprehensive solar analytics platform built on real Swiss federal data.
            </p>
          </ScrollSection>

          <div className="grid md:grid-cols-3 gap-6">
            {cards.map((card, i) => (
              <ScrollSection key={card.title}>
                <motion.div
                  whileHover={{ y: -4, boxShadow: "var(--shadow-elevated)" }}
                  transition={{ type: "spring", stiffness: 300 }}
                  className="p-6 rounded-2xl border border-primary/15 gradient-card shadow-soft"
                >
                  <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center mb-4 shadow-glow">
                    <card.icon className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <h3 className="font-display font-semibold text-lg mb-2 text-foreground">{card.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{card.desc}</p>
                </motion.div>
              </ScrollSection>
            ))}
          </div>
        </div>
      </section>

      {/* Scroll Stack Sections */}
      <section className="relative py-20 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-accent/20 to-primary/8" />
        <div className="absolute inset-0 topo-pattern opacity-40" />
        <div className="absolute inset-0 noise-overlay opacity-[0.03]" />
        <div className="absolute top-20 right-[10%] w-80 h-80 rounded-full bg-primary/18 blur-[100px] animated-blob" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        <div className="relative max-w-3xl mx-auto space-y-20">
          {scrollSections.map((s, i) => (
            <ScrollSection key={s.title}>
              <div className="flex items-start gap-5">
                <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center shrink-0 shadow-glow">
                  <s.icon className="w-7 h-7 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-2xl text-foreground mb-3">{s.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{s.text}</p>
                </div>
              </div>
            </ScrollSection>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-24 px-6 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-primary/10 via-accent/15 to-background" />
        <div className="absolute inset-0 topo-pattern opacity-20" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/20 blur-[120px] animated-blob" />
        <ScrollSection className="relative max-w-2xl mx-auto">
          <h2 className="font-display font-bold text-3xl md:text-4xl text-foreground mb-4">
            Ready to Explore?
          </h2>
          <p className="text-muted-foreground mb-8">
            Dive into Switzerland's most comprehensive solar rooftop database.
          </p>
          <Link
            to="/map"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-primary-foreground gradient-primary shadow-glow hover:shadow-elevated transition-all duration-300 hover:scale-[1.03] ring-2 ring-primary/20 ring-offset-2 ring-offset-background"
          >
            Open the Map
            <ArrowRight className="w-5 h-5" />
          </Link>
        </ScrollSection>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 px-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Oikos Solar · Built with Swiss precision
      </footer>
    </div>
  );
}
