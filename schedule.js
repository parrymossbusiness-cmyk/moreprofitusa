document.addEventListener('DOMContentLoaded', () => {
  // Fade-up observer
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));

  // Nav scroll
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 60), { passive: true });

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
    } else { spans.forEach(s => { s.style.transform = ''; s.style.opacity = ''; }); }
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
      if (target) { e.preventDefault(); window.scrollTo({ top: target.getBoundingClientRect().top + window.pageYOffset - 80, behavior: 'smooth' }); }
    });
  });

  // Sticky CTA
  const stickyCta = document.getElementById('stickyCta');
  const heroSection = document.getElementById('sch-hero');
  if (stickyCta && heroSection) {
    const stickyObs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        stickyCta.style.transform = entry.isIntersecting ? 'translateY(100%)' : 'translateY(0)';
        stickyCta.style.transition = 'transform 0.3s ease';
      });
    }, { threshold: 0.1 });
    stickyObs.observe(heroSection);
  }

  // Timezone detection
  const tzEl = document.getElementById('detectedTimezone');
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzName = tz.replace(/_/g, ' ').replace(/\//g, ' / ');
    tzEl.textContent = tzName;
  } catch (e) { tzEl.textContent = 'Auto-detected when you book'; }

  // ==================== CALENDAR LOGIC ====================
  const calDays = document.getElementById('calDays');
  const calMonthYear = document.getElementById('calMonthYear');
  const calPrev = document.getElementById('calPrev');
  const calNext = document.getElementById('calNext');
  const calTimes = document.getElementById('calTimes');
  const calTimeSlots = document.getElementById('calTimeSlots');
  const calConfirm = document.getElementById('calConfirm');
  const calSuccess = document.getElementById('calSuccess');
  const selectedDateLabel = document.getElementById('selectedDateLabel');
  const confirmDate = document.getElementById('confirmDate');
  const confirmTime = document.getElementById('confirmTime');

  const now = new Date();
  let currentMonth = now.getMonth();
  let currentYear = now.getFullYear();
  let selectedDate = null;
  let selectedTime = null;

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  function renderCalendar() {
    calMonthYear.textContent = `${monthNames[currentMonth]} ${currentYear}`;
    calDays.innerHTML = '';
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const today = new Date(); today.setHours(0,0,0,0);

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      const el = document.createElement('div');
      el.className = 'cal-day empty';
      calDays.appendChild(el);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(currentYear, currentMonth, d);
      const el = document.createElement('div');
      el.className = 'cal-day';
      el.textContent = d;

      // Disable past days and weekends
      if (date < today || date.getDay() === 0 || date.getDay() === 6) {
        el.classList.add('disabled');
      } else {
        if (date.getTime() === today.getTime()) el.classList.add('today');
        if (selectedDate && date.getTime() === selectedDate.getTime()) el.classList.add('selected');
        el.addEventListener('click', () => selectDate(date, d));
      }
      calDays.appendChild(el);
    }
  }

  function selectDate(date, day) {
    selectedDate = date;
    renderCalendar();
    showTimeSlots(date);
  }

  function showTimeSlots(date) {
    const formatted = `${dayNames[date.getDay()]}, ${monthNames[date.getMonth()]} ${date.getDate()}`;
    selectedDateLabel.textContent = formatted;
    calTimeSlots.innerHTML = '';

    // Generate time slots (9am - 5pm, 30min intervals)
    const times = [];
    for (let h = 9; h < 17; h++) {
      times.push(`${h > 12 ? h - 12 : h}:00 ${h >= 12 ? 'PM' : 'AM'}`);
      times.push(`${h > 12 ? h - 12 : h}:30 ${h >= 12 ? 'PM' : 'AM'}`);
    }

    // Randomly disable a few to feel realistic
    const disabled = new Set();
    for (let i = 0; i < 4; i++) disabled.add(Math.floor(Math.random() * times.length));

    times.forEach((time, i) => {
      if (disabled.has(i)) return;
      const el = document.createElement('div');
      el.className = 'cal-time-slot';
      el.textContent = time;
      if (selectedTime === time) el.classList.add('selected');
      el.addEventListener('click', () => selectTime(time, date));
      calTimeSlots.appendChild(el);
    });

    // Show time slots, hide calendar
    document.querySelector('.cal-header').style.display = 'none';
    document.querySelector('.cal-weekdays').style.display = 'none';
    calDays.style.display = 'none';
    calTimes.style.display = 'block';
    calConfirm.style.display = 'none';
  }

  function selectTime(time, date) {
    selectedTime = time;
    const formatted = `${dayNames[date.getDay()]}, ${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    confirmDate.textContent = formatted;
    confirmTime.textContent = time;

    calTimes.style.display = 'none';
    calConfirm.style.display = 'block';
  }

  // Back buttons
  document.getElementById('calBackToDate').addEventListener('click', () => {
    calTimes.style.display = 'none';
    document.querySelector('.cal-header').style.display = 'flex';
    document.querySelector('.cal-weekdays').style.display = 'grid';
    calDays.style.display = 'grid';
    selectedTime = null;
  });

  document.getElementById('calBackToTime').addEventListener('click', () => {
    calConfirm.style.display = 'none';
    calTimes.style.display = 'block';
  });

  // Nav buttons
  calPrev.addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
  });
  calNext.addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar();
  });

  // Form submit
  const form = document.getElementById('scheduleForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let valid = true;
    form.querySelectorAll('[required]').forEach(input => {
      const group = input.closest('.cal-form-group');
      if (!input.value.trim()) { group.classList.add('error'); valid = false; }
      else { group.classList.remove('error'); }
      if (input.type === 'email' && input.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) { group.classList.add('error'); valid = false; }
    });
    if (!valid) return;

    const btn = document.getElementById('confirmBtn');
    btn.querySelector('.btn-text').style.display = 'none';
    btn.querySelector('svg').style.display = 'none';
    btn.querySelector('.btn-loader').style.display = 'flex';
    btn.disabled = true;

    const data = Object.fromEntries(new FormData(form).entries());
    data.date = confirmDate.textContent;
    data.time = confirmTime.textContent;
    console.log('Call scheduled:', data);

    setTimeout(() => {
      calConfirm.style.display = 'none';
      document.getElementById('successDate').textContent = data.date;
      document.getElementById('successTime').textContent = data.time;
      calSuccess.style.display = 'block';
    }, 1800);
  });

  // Remove error on input
  form.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', () => input.closest('.cal-form-group').classList.remove('error'));
  });

  // Initialize
  renderCalendar();

  // Parallax
  const heroGrid = document.querySelector('.sch-grid-bg');
  if (heroGrid) {
    window.addEventListener('scroll', () => {
      if (window.scrollY < window.innerHeight) heroGrid.style.transform = `translateY(${window.scrollY * 0.15}px)`;
    }, { passive: true });
  }
});
