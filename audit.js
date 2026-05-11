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

  // Check card bar animation
  const cardObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        cardObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });
  document.querySelectorAll('.check-card').forEach(el => cardObserver.observe(el));

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
  const heroSection = document.getElementById('audit-hero');
  if (stickyCta && heroSection) {
    const stickyObs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        stickyCta.style.transform = entry.isIntersecting ? 'translateY(100%)' : 'translateY(0)';
        stickyCta.style.transition = 'transform 0.3s ease';
      });
    }, { threshold: 0.1 });
    stickyObs.observe(heroSection);
  }

  // Animated stat counters
  const statObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const nums = entry.target.querySelectorAll('.proof-stat-num');
        nums.forEach(num => {
          const target = parseInt(num.dataset.target);
          const duration = 1500;
          const start = performance.now();
          const animate = (now) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            num.textContent = Math.round(target * eased);
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        });
        statObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });
  const proofStats = document.querySelector('.proof-stats');
  if (proofStats) statObserver.observe(proofStats);

  // Multi-step form
  const form = document.getElementById('auditForm');
  const progressFill = document.getElementById('progressFill');
  const steps = document.querySelectorAll('.progress-step');
  let currentStep = 1;

  function goToStep(step) {
    document.querySelector(`.form-step.active`).classList.remove('active');
    document.querySelector(`.form-step[data-step="${step}"]`).classList.add('active');
    steps.forEach(s => {
      const sNum = parseInt(s.dataset.step);
      s.classList.remove('active', 'completed');
      if (sNum === step) s.classList.add('active');
      else if (sNum < step) s.classList.add('completed');
    });
    progressFill.style.width = `${(step / 3) * 100}%`;
    currentStep = step;
    // Scroll form into view
    document.querySelector('.form-outer').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function validateStep(step) {
    const stepEl = document.querySelector(`.form-step[data-step="${step}"]`);
    const required = stepEl.querySelectorAll('[required]');
    let valid = true;
    required.forEach(input => {
      const group = input.closest('.form-group');
      if (!input.value.trim()) {
        group.classList.add('error');
        valid = false;
      } else {
        group.classList.remove('error');
      }
      if (input.type === 'email' && input.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) {
        group.classList.add('error');
        valid = false;
      }
    });
    return valid;
  }

  document.querySelectorAll('.form-next').forEach(btn => {
    btn.addEventListener('click', () => {
      if (validateStep(currentStep)) goToStep(parseInt(btn.dataset.next));
    });
  });
  document.querySelectorAll('.form-prev').forEach(btn => {
    btn.addEventListener('click', () => goToStep(parseInt(btn.dataset.prev)));
  });

  // Remove error on input
  form.querySelectorAll('input, select, textarea').forEach(input => {
    input.addEventListener('input', () => input.closest('.form-group').classList.remove('error'));
  });

  // Form submit
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateStep(3)) return;

    const submitBtn = document.getElementById('submitBtn');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoader = submitBtn.querySelector('.btn-loader');
    const btnSvg = submitBtn.querySelector('svg');
    btnText.style.display = 'none';
    btnSvg.style.display = 'none';
    btnLoader.style.display = 'flex';
    submitBtn.disabled = true;

    // Collect form data
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    console.log('Audit form submitted:', data);

    // Simulate API call / email trigger
    setTimeout(() => {
      form.style.display = 'none';
      document.querySelector('.form-progress').style.display = 'none';
      document.querySelector('.form-header').style.display = 'none';
      const success = document.getElementById('formSuccess');
      success.style.display = 'block';
      success.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Trigger confirmation email (simulation)
      sendConfirmationEmail(data);
    }, 2000);
  });

  function sendConfirmationEmail(data) {
    // In production, this would call your backend API
    console.log('Confirmation email triggered for:', data.email);
    console.log('Email subject: We Received Your Free Growth Audit Request');
    console.log('Email body would include personalized audit details for:', data.company);
  }

  // Parallax on hero grid
  const heroGrid = document.querySelector('.audit-grid-bg');
  if (heroGrid) {
    window.addEventListener('scroll', () => {
      if (window.scrollY < window.innerHeight) {
        heroGrid.style.transform = `translateY(${window.scrollY * 0.15}px)`;
      }
    }, { passive: true });
  }
});
