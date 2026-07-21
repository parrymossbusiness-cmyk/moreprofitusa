// Header solid-on-scroll + mobile hamburger menu

document.addEventListener('DOMContentLoaded', function () {
  var header = document.getElementById('siteHeader');
  var hamburger = document.getElementById('hamburger');
  var mainNav = document.getElementById('mainNav');

  function updateHeader() {
    if (window.scrollY > 40) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }

  updateHeader();
  window.addEventListener('scroll', updateHeader);

  hamburger.addEventListener('click', function () {
    var isOpen = mainNav.classList.toggle('open');
    hamburger.classList.toggle('active', isOpen);
    hamburger.setAttribute('aria-expanded', isOpen);
  });

  // Close mobile menu after tapping a link
  mainNav.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      mainNav.classList.remove('open');
      hamburger.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });
});
