const screenshotDetails = {
  dashboard: {
    src: "./assets/dashboard-overview.png",
    alt: "NotiCare dashboard with real-time scanning status and community risk totals",
    label: "Your protection at a glance",
    description: "Check monitoring status and review anonymous community risk totals.",
    tabId: "tab-dashboard",
    count: "01 / 02",
  },
  manual: {
    src: "./assets/manual-scan.png",
    alt: "NotiCare manual scan screen with a message analysis result and warning signs",
    label: "A closer look at a message",
    description: "Review a message result and the warning signs behind its risk level.",
    tabId: "tab-manual-scan",
    count: "02 / 02",
  },
};

const screenshotShowcase = document.querySelector("[data-screenshot-showcase]");

if (screenshotShowcase) {
  const tabs = [...screenshotShowcase.querySelectorAll("[data-screenshot]")];
  const panel = screenshotShowcase.querySelector("#screenshot-panel");
  const image = screenshotShowcase.querySelector("[data-showcase-image]");
  const label = screenshotShowcase.querySelector(".showcase-label");
  const description = screenshotShowcase.querySelector("[data-showcase-description]");
  const count = screenshotShowcase.querySelector("[data-showcase-count]");
  const phone = screenshotShowcase.querySelector(".showcase-phone");

  function selectScreenshot(tab, moveFocus = false) {
    const details = screenshotDetails[tab.dataset.screenshot];
    if (!details) return;

    tabs.forEach((item) => {
      const selected = item === tab;
      item.classList.toggle("is-active", selected);
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
    });

    panel.setAttribute("aria-labelledby", details.tabId);
    image.src = details.src;
    image.alt = details.alt;
    label.textContent = details.label;
    description.textContent = details.description;
    count.textContent = details.count;
    phone.classList.add("is-changing");
    requestAnimationFrame(() => phone.classList.remove("is-changing"));

    if (moveFocus) tab.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectScreenshot(tab));
    tab.addEventListener("keydown", (event) => {
      let nextIndex;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        nextIndex = (index + 1) % tabs.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        nextIndex = (index - 1 + tabs.length) % tabs.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = tabs.length - 1;
      } else {
        return;
      }

      event.preventDefault();
      selectScreenshot(tabs[nextIndex], true);
    });
  });
}

const progressBar = document.querySelector(".scroll-progress span");
const header = document.querySelector(".site-header");
const backToTop = document.querySelector(".back-to-top");
let scrollUpdatePending = false;

function updateScrollControls() {
  const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollableHeight > 0 ? window.scrollY / scrollableHeight : 0;
  progressBar?.style.setProperty("transform", `scaleX(${Math.min(progress, 1)})`);
  header?.classList.toggle("is-scrolled", window.scrollY > 4);

  const showBackToTop = window.scrollY > 500;
  backToTop?.classList.toggle("is-visible", showBackToTop);
  backToTop?.setAttribute("aria-hidden", String(!showBackToTop));
  backToTop?.setAttribute("tabindex", showBackToTop ? "0" : "-1");
  scrollUpdatePending = false;
}

window.addEventListener(
  "scroll",
  () => {
    if (scrollUpdatePending) return;
    scrollUpdatePending = true;
    requestAnimationFrame(updateScrollControls);
  },
  { passive: true },
);
window.addEventListener("resize", updateScrollControls);
updateScrollControls();

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if ("IntersectionObserver" in window && !prefersReducedMotion) {
  const revealItems = document.querySelectorAll("[data-reveal]");
  document.documentElement.classList.add("js-enabled");

  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12 },
  );

  revealItems.forEach((item) => revealObserver.observe(item));
}
