import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Sparkles, Microscope } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { MicrobeCard } from '../components/MicrobeCard';
import { CategoryCard } from '../components/CategoryCard';
import { StatCounter } from '../components/StatCounter';
import { CATEGORY_COLORS } from '../../shared/types';

const categoryDescriptions: Record<string, string> = {
  bacteria:
    '地球上最古老、分布最广的生命形式。从深海热泉到人体肠道，它们无处不在，塑造了我们的世界。',
  fungi:
    '自然界的分解者与酿造大师。从青霉素到餐桌上的蘑菇，真菌与人类文明交织前行。',
  virus:
    '非细胞形态的神秘存在。介于生命与非生命之间，它们推动进化，也带来挑战。',
  archaea:
    '被遗忘的第三域生命。在极端环境中演化出独特的生存智慧，揭示生命的边界。',
};

export function HomePage() {
  const { microbes, stats, fetchMicrobes, fetchStats } = useAppStore();

  useEffect(() => {
    fetchMicrobes({ limit: 8 });
    fetchStats();
  }, [fetchMicrobes, fetchStats]);

  return (
    <div className="relative">
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-grid-pattern">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background pointer-events-none" />

        <div className="container mx-auto px-6 pt-32 pb-20 relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <div className="animate-fade-in-up stagger-1 opacity-0 inline-flex items-center gap-2 px-5 py-2 rounded-full border border-glow-primary/30 bg-glow-primary/5 backdrop-blur-sm mb-8">
              <Sparkles className="w-4 h-4 text-glow-primary" />
              <span className="font-mono text-xs text-glow-primary tracking-[0.2em] uppercase">
                Welcome to the Microworld
              </span>
            </div>

            <h1 className="animate-fade-in-up stagger-2 opacity-0 font-display text-6xl md:text-8xl lg:text-9xl font-bold text-text-light mb-6 leading-[1.05] tracking-tight">
              <span className="block">探索</span>
              <span className="block text-gradient-primary text-shadow-glow">微观文明</span>
            </h1>

            <p className="animate-fade-in-up stagger-3 opacity-0 font-mono text-base md:text-lg text-text-muted/80 max-w-2xl mx-auto mb-12 leading-relaxed">
              踏入显微镜下的浩瀚宇宙。这里有数万亿计的生命在呼吸、演化、建造属于它们的文明。
              <br className="hidden md:block" />
              让我们一同揭开这个隐形世界的神秘面纱。
            </p>

            <div className="animate-fade-in-up stagger-4 opacity-0 flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
              <Link to="/lab/gram" className="btn-primary">
                <Microscope className="w-5 h-5" />
                开始革兰染色实验
              </Link>
              <Link to="/category/bacteria" className="btn-primary-ghost">
                <Microscope className="w-4 h-4" />
                浏览细菌标本
              </Link>
            </div>
          </div>

          <div className="animate-fade-in-up stagger-5 opacity-0 absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
            <span className="font-mono text-[10px] text-text-muted/50 tracking-[0.3em] uppercase">
              Scroll Down
            </span>
            <ChevronDown className="w-5 h-5 text-text-muted/50 animate-bounce" />
          </div>
        </div>
      </section>

      <section id="categories" className="relative py-32">
        <div className="container mx-auto px-6">
          <div className="text-center mb-20">
            <span className="font-mono text-xs text-glow-primary tracking-[0.3em] uppercase mb-4 block animate-fade-in-up opacity-0 stagger-1">
              Four Kingdoms
            </span>
            <h2 className="animate-fade-in-up stagger-2 opacity-0 font-display text-5xl md:text-6xl font-semibold text-text-light mb-6">
              四大微生物界
            </h2>
            <p className="animate-fade-in-up stagger-3 opacity-0 font-mono text-text-muted/70 max-w-2xl mx-auto">
              从最原始的古菌到最复杂的真菌，每一类微生物都有其独特的演化故事和生态位
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {(['bacteria', 'fungi', 'virus', 'archaea'] as const).map((cat, idx) => (
              <CategoryCard
                key={cat}
                category={cat}
                count={stats?.[cat] ?? 0}
                description={categoryDescriptions[cat]}
                index={idx}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-32 bg-gradient-to-b from-transparent via-background-card/30 to-transparent">
        <div className="container mx-auto px-6">
          <div className="glass-card p-12 md:p-16 relative overflow-hidden">
            <div className="absolute -top-32 -right-32 w-64 h-64 rounded-full bg-glow-primary/10 blur-[80px]" />
            <div className="absolute -bottom-32 -left-32 w-64 h-64 rounded-full bg-glow-purple/10 blur-[80px]" />

            <div className="relative z-10">
              <div className="text-center mb-16">
                <span className="font-mono text-xs text-glow-primary tracking-[0.3em] uppercase mb-4 block animate-fade-in-up opacity-0">
                  Museum Collection
                </span>
                <h2 className="animate-fade-in-up stagger-1 opacity-0 font-display text-5xl md:text-6xl font-semibold text-text-light mb-6">
                  馆藏精选标本
                </h2>
                <p className="animate-fade-in-up stagger-2 opacity-0 font-mono text-text-muted/70 max-w-2xl mx-auto">
                  来自世界各地的代表性微生物标本，每一种都承载着独特的科学故事
                </p>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {microbes.slice(0, 8).map((m, idx) => (
                  <MicrobeCard key={m.id} microbe={m} index={idx} />
                ))}
              </div>

              {microbes.length === 0 && (
                <div className="text-center py-20 text-text-muted font-mono">
                  <div className="animate-pulse">标本加载中...</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="relative py-32">
        <div className="container mx-auto px-6">
          <div className="max-w-5xl mx-auto glass-card p-12 md:p-16 relative overflow-hidden">
            <div className="absolute inset-0 bg-grid-pattern opacity-50" />

            <div className="relative z-10">
              <div className="text-center mb-16">
                <span className="font-mono text-xs text-glow-primary tracking-[0.3em] uppercase mb-4 block animate-fade-in-up opacity-0">
                  Statistics
                </span>
                <h2 className="animate-fade-in-up stagger-1 opacity-0 font-display text-4xl md:text-5xl font-semibold text-text-light mb-6">
                  馆藏数据一览
                </h2>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
                <StatCounter
                  value={stats?.total ?? 0}
                  label="标本总数"
                  color={CATEGORY_COLORS.bacteria}
                  delay={0}
                />
                <StatCounter
                  value={stats?.bacteria ?? 0}
                  label="细菌种类"
                  color={CATEGORY_COLORS.bacteria}
                  delay={150}
                />
                <StatCounter
                  value={stats?.fungi ?? 0}
                  label="真菌种类"
                  color={CATEGORY_COLORS.fungi}
                  delay={300}
                />
                <StatCounter
                  value={stats?.virus ?? 0}
                  label="病毒种类"
                  color={CATEGORY_COLORS.virus}
                  delay={450}
                />
                <StatCounter
                  value={stats?.archaea ?? 0}
                  label="古菌种类"
                  color={CATEGORY_COLORS.archaea}
                  delay={600}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative py-32">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center">
            <span className="font-mono text-xs text-glow-primary tracking-[0.3em] uppercase mb-6 block animate-fade-in-up opacity-0">
              Philosophy
            </span>
            <h2 className="animate-fade-in-up stagger-1 opacity-0 font-display text-4xl md:text-5xl font-semibold text-text-light mb-10 leading-tight">
              &ldquo;在一滴水中，
              <br />
              <span className="text-gradient-primary">我们看见整个宇宙。</span>&rdquo;
            </h2>
            <p className="animate-fade-in-up stagger-2 opacity-0 font-mono text-text-muted/70 text-lg leading-relaxed">
              微生物是地球最早的居民，也是最沉默的工程师。它们塑造了大气、土壤和海洋，
              甚至每一个人类的身体。认识它们，就是重新认识我们自己在生命之树中的位置。
            </p>

            <div className="animate-fade-in-up stagger-3 opacity-0 mt-12">
              <Link to="/category/bacteria" className="btn-primary">
                开启微观之旅
                <ChevronDown className="w-5 h-5 rotate-[-90deg]" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
