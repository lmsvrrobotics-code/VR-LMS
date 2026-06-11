import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  Heart,
  Target,
  Users,
  Globe,
  Lightbulb
} from "lucide-react";



const About = () => {
  const values = [
    {
      icon: Heart,
      title: "Compassion",
      description: "We believe education is a fundamental right, not a privilege. Every learner deserves access to quality education regardless of their economic background."
    },
    {
      icon: Target,
      title: "Excellence",
      description: "We maintain the highest standards in our educational content, ensuring every opportunity meets professional industry requirements."
    },
    {
      icon: Users,
      title: "Community",
      description: "Learning is better together. We foster a supportive environment where learners help each other grow and succeed."
    },
    {
      icon: Globe,
      title: "Accessibility",
      description: "Breaking down geographical and financial barriers to make quality education available to everyone, everywhere."
    }
  ];

  // Trainers & team — ported from index.vrrobotics-backup.html
  // ("Meet the Trainers & Leads"). Photos hosted on Cloudinary.
  const team: {
    name: string;
    role: string;
    description: string;
    photo: string;
    accent: string;
    featured: boolean;
    tags: string[];
    qual?: string;
    highlights?: string[];
  }[] = [
    {
      name: "Vamsi Mittapalli",
      role: "CEO & Founder · Robotics & AIoT Trainer",
      description: "B.Tech in Electrical & Electronics Engineering and a Robotics Trainer, Vamsi founded VR Robotics Academy to close the gap between classroom theory and real-world building. He has led hands-on robotics workshops across multiple campuses and designed the project-based curriculum students learn on today.",
      qual: "B.Tech — Electrical & Electronics Engineering · Robotics Trainer",
      photo: "https://res.cloudinary.com/dqcybkje5/image/upload/v1777619263/vamshii2_tdbxjj.jpg",
      accent: "#FF6A00",
      featured: true,
      highlights: [
        "Conducted hands-on robotics workshops across multiple campuses",
        "Designed the academy's project-based learning modules",
        "Mentored students in real-world robotics & AIoT applications",
      ],
      tags: ["Arduino", "Microbit", "Raspberry Pi", "Python", "Scratch", "ROS"],
    },
  ];
  // The CEO/Founder gets a big feature card; everyone else sits in a row below.
  const lead = team.find((m) => m.featured) || team[0];
  const others = team.filter((m) => m !== lead);

  return (
    <div className="overflow-hidden">
      {/* Hero Section */}
      <section className="section-padding ">
        <div className="container-ngo">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
                About <span className="text-gradient">Us</span>
              </h1>
              {/* <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
               To provide high-quality, accessible education and professional development opportunities to underserved communities worldwide, empowering individuals to transform their lives and communities.
              </p> */}
            </div>

            {/* <div className="grid md:grid-cols-3 gap-6 pt-8">
              <div className="text-center space-y-2">
                <div className="text-3xl font-bold text-gradient">5,000+</div>
                <div className="text-muted-foreground">Lives Changed</div>
              </div>
              <div className="text-center space-y-2">
                <div className="text-3xl font-bold text-gradient">25+</div>
                <div className="text-muted-foreground">Free Courses</div>
              </div>
              <div className="text-center space-y-2">
                <div className="text-3xl font-bold text-gradient">50+</div>
                <div className="text-muted-foreground">Partner Organizations</div>
              </div>
            </div> */}
          </div>
        </div>
      </section>

      {/* Story Section */}
      <section className="section-padding">
        <div className="container-ngo">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h2 className="text-3xl md:text-4xl font-bold">
                Our <span className="text-gradient">Story</span>
              </h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  VR Robotics Academy is a future-focused robotics and AI learning institute. It was founded by doctorates from prestigious universities with extensive corporate experience to address the critical gap between academic preparation and industry requirements. We believe in creating sustainable bridges between educational institutions and Corporations to benefit all stakeholders.
                </p>
                <p>
                  Today, we partner with organizations worldwide to identify educational gaps and 
                  create targeted programs that make a real difference in people's lives. Every course 
                  we develop is designed with one goal in mind: practical skills that lead to 
                  real opportunities.
                </p>
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="card-ngo p-6 space-y-4 border-2 border-warm-green rounded-xl">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-hero rounded-lg flex items-center justify-center">
                    <Lightbulb className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold">Our Vision</h3>
                </div>
                <p className="text-muted-foreground">
                  A world where every student graduates industry-ready, and every company finds the talent they need to innovate and grow.
                </p>
              </div>
              
              <div className="card-ngo p-6 space-y-4 border-2 border-warm-green rounded-xl">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-hero rounded-lg flex items-center justify-center">
                    <Target className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold">Our Mission</h3>
                </div>
                <p className="text-muted-foreground">
                  To empower students with industry-relevant skills while creating meaningful connections between educational institutions and corporations.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="section-padding bg-gradient-subtle">
        <div className="container-ngo">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">
              Our <span className="text-gradient">Values</span>
            </h2>
            {/* <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              These core values guide everything we do and shape how we serve our community of learners.
            </p> */}
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value, index) => (
              <Card key={index} className="card-ngo border-0 text-center border-2 border-warm-green rounded-xl">
                <CardHeader className="space-y-4">
                  <div className="w-12 h-12 bg-gradient-hero rounded-lg flex items-center justify-center mx-auto">
                    <value.icon className="w-6 h-6 text-white" />
                  </div>
                  <CardTitle className="text-lg">{value.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="leading-relaxed">
                    {value.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="section-padding">
        <div className="container-ngo">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">
              Meet Our <span className="text-gradient">Trainers &amp; Team</span>
            </h2>
            <p className="text-base text-muted-foreground max-w-2xl mx-auto">
              All sessions are led by qualified engineering professionals — degree-qualified,
              background-verified, and certified in our curriculum.
            </p>
          </div>

          <div className="max-w-5xl mx-auto space-y-6">
            {/* ── Lead / Founder — big feature card ── */}
            <div
              className="card-ngo-static rounded-2xl border border-border/60 bg-card overflow-hidden grid md:grid-cols-[minmax(0,360px)_1fr]"
              style={{ borderTop: `4px solid ${lead.accent}` }}
            >
              <div className="relative">
                <img
                  src={lead.photo}
                  alt={lead.name}
                  loading="lazy"
                  className="w-full h-72 md:h-full object-cover object-top"
                />
                <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-gradient-hero text-white text-[11px] font-bold px-2.5 py-1 shadow">
                  ★ Founder · CEO
                </span>
              </div>
              <div className="p-6 sm:p-8 flex flex-col">
                <h3 className="font-bold text-2xl leading-tight">{lead.name}</h3>
                <p className="text-sm font-semibold mt-1" style={{ color: lead.accent }}>{lead.role}</p>
                <p className="text-[15px] text-muted-foreground mt-4 leading-relaxed">{lead.description}</p>

                {lead.highlights && (
                  <ul className="mt-5 space-y-2">
                    {lead.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 text-primary" style={{ color: lead.accent }}>✓</span>
                        <span className="text-foreground/80">{h}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap gap-1.5 mt-6">
                  {lead.tags.map((t) => (
                    <span key={t} className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* ── The rest of the team — cards below (hidden if none) ── */}
            {others.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-6">
              {others.map((member, index) => (
                <div
                  key={index}
                  className="card-ngo-static rounded-2xl border border-border/60 bg-card overflow-hidden flex flex-col"
                  style={{ borderTop: `4px solid ${member.accent}` }}
                >
                  <div className="relative">
                    <img
                      src={member.photo}
                      alt={member.name}
                      loading="lazy"
                      className="w-full h-60 object-cover object-top"
                    />
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="font-bold text-lg leading-tight">{member.name}</h3>
                    <p className="text-sm font-semibold mt-1" style={{ color: member.accent }}>{member.role}</p>
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{member.description}</p>
                    <div className="flex flex-wrap gap-1.5 mt-4">
                      {member.tags.map((t) => (
                        <span key={t} className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        </div>
      </section>


   
      {/* CTA Section */}
      {/* <section className="section-padding">
        <div className="container-ngo">
          <div className="card-ngo max-w-4xl mx-auto text-center p-8 lg:p-12 space-y-8 bg-gradient-hero">
            <div className="space-y-4">
              <h2 className="text-3xl md:text-4xl font-bold text-white">
                Join Our Mission
              </h2>
              <p className="text-lg text-white/90 max-w-2xl mx-auto">
                Whether you're a learner looking to grow, an organization wanting to partner, 
                or someone who believes in our mission - there's a place for you in our community.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" variant="secondary" className="text-lg px-8" asChild>
                <Link to="/courses">Start Learning</Link>
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8 border-white text-primary hover:bg-white hover:text-primary" asChild>
                <Link to="/contact">Partner With Us</Link>
              </Button>
            </div>
          </div>
        </div>
      </section> */}
    </div>
  );
};

export default About;