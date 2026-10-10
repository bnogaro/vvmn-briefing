// reveal.js plugin that cycles through the images of each <ul class="gallery">
// while its slide is shown:
//   <ul class="gallery" data-interval="1" data-iterations="0">
// data-interval: seconds per image (default 1).
// data-iterations: plays before stopping on the last image, 0 loops forever (default 1).
// Register it with Reveal.initialize({ plugins: [RevealGallery] }).
window.RevealGallery = {
  id: 'gallery',

  init(deck) {
    const timers = new Map();

    // Returns a function that shows the next image each time it is called.
    function stepper(items, iterations) {
      let current = 0;
      let loops = 0;
      return () => {
        if (iterations > 0 && loops === iterations) return;
        items[current].className = 'inactive';
        if (current === items.length - 1) {
          loops++;
          if (iterations === 0 || loops < iterations) current = 0;
        } else {
          current++;
        }
        items[current].className = 'active';
      };
    }

    function start(slide) {
      for (const gallery of slide?.querySelectorAll('.gallery') ?? []) {
        const items = [...gallery.querySelectorAll('li')];
        if (items.length === 0) continue;
        items.forEach((item, index) => {
          item.className = index === 0 ? 'active' : 'inactive';
        });
        const iterations = gallery.dataset.iterations ? Number(gallery.dataset.iterations) : 1;
        const interval = Number(gallery.dataset.interval || 1) * 1000;
        clearInterval(timers.get(gallery));
        timers.set(gallery, setInterval(stepper(items, iterations), interval));
      }
    }

    function stop(slide) {
      for (const gallery of slide?.querySelectorAll('.gallery') ?? []) {
        clearInterval(timers.get(gallery));
        timers.delete(gallery);
      }
    }

    deck.on('ready', (event) => start(event.currentSlide));
    deck.on('slidechanged', (event) => {
      stop(event.previousSlide);
      start(event.currentSlide);
    });
  },
};
