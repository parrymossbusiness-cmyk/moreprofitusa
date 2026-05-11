document.addEventListener('DOMContentLoaded', () => {
  // Fade-up observer
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));

  // Nav scroll
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });

  // Mobile nav
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    const spans = navToggle.querySelectorAll('span');
    if (navLinks.classList.contains('open')) {
      spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
      spans[1].style.opacity = '0';
      spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
    } else {
      spans.forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
    }
  });
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      navToggle.querySelectorAll('span').forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
    });
  });

  // Smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        window.scrollTo({ top: target.getBoundingClientRect().top + window.pageYOffset - 80, behavior: 'smooth' });
      }
    });
  });

  // Sticky CTA
  const stickyCta = document.getElementById('stickyCta');
  const heroSection = document.getElementById('demos-hero');
  if (stickyCta && heroSection) {
    const stickyObs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        stickyCta.style.transform = entry.isIntersecting ? 'translateY(100%)' : 'translateY(0)';
        stickyCta.style.transition = 'transform 0.3s ease';
      });
    }, { threshold: 0.1 });
    stickyObs.observe(heroSection);
  }

  // Parallax on hero grid
  const heroGrid = document.querySelector('.demos-grid-bg');
  if (heroGrid) {
    window.addEventListener('scroll', () => {
      if (window.scrollY < window.innerHeight) {
        heroGrid.style.transform = `translateY(${window.scrollY * 0.15}px)`;
      }
    }, { passive: true });
  }

  // Demo card hover tilt (desktop only)
  if (window.matchMedia('(min-width: 769px)').matches) {
    document.querySelectorAll('.demo-card').forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = `translateY(-4px) perspective(800px) rotateX(${y * -3}deg) rotateY(${x * 3}deg)`;
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
      });
    });
  }

  // Feature card hover pulse
  document.querySelectorAll('.feature-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
      const icon = card.querySelector('.feature-icon');
      icon.style.transform = 'scale(1.1)';
      icon.style.transition = 'transform 0.3s ease';
    });
    card.addEventListener('mouseleave', () => {
      const icon = card.querySelector('.feature-icon');
      icon.style.transform = '';
    });
  });
});
