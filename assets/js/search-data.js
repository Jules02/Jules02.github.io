// get the ninja-keys element
const ninja = document.querySelector('ninja-keys');

// add the home and posts menu items
ninja.data = [{
    id: "nav-about",
    title: "about",
    section: "Navigation",
    handler: () => {
      window.location.href = "/";
    },
  },{id: "nav-blog",
          title: "blog",
          description: "",
          section: "Navigation",
          handler: () => {
            window.location.href = "/blog/";
          },
        },{id: "nav-publications",
          title: "publications",
          description: "Publications and preprints, in reverse chronological order.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/publications/";
          },
        },{id: "nav-projects",
          title: "projects",
          description: "Research projects and competition work.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/projects/";
          },
        },{id: "nav-cv",
          title: "cv",
          description: "Education, experience, and skills.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/cv/";
          },
        },{id: "nav-activities",
          title: "activities",
          description: "Teaching assistantships and other academic activities.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/activities/";
          },
        },{id: "projects-hack-the-world-s",
          title: 'Hack the World(s)',
          description: "Learning the latent dynamics of physical fields with V-JEPA — 1st place out of 25 teams",
          section: "Projects",handler: () => {
              window.location.href = "/projects/hack-the-worlds/";
            },},{id: "projects-mbqc-and-the-zx-calculus",
          title: 'MBQC and the ZX-Calculus',
          description: "Parcours Recherche at Centre INRIA de Nancy, on measurement-based quantum computing",
          section: "Projects",handler: () => {
              window.location.href = "/projects/mbqc-zx-calculus/";
            },},{id: "projects-svm-based-face-detection",
          title: 'SVM-based face detection',
          description: "TIPE research project at Lycée Saint-Louis, on support vector machines for face detection",
          section: "Projects",handler: () => {
              window.location.href = "/projects/svm-face-detection/";
            },},{
        id: 'social-email',
        title: 'email',
        section: 'Socials',
        handler: () => {
          window.open("mailto:%6A%75%6C%65%73%64%75%70%6F%6E%74%30%32@%67%6D%61%69%6C.%63%6F%6D", "_blank");
        },
      },{
        id: 'social-github',
        title: 'GitHub',
        section: 'Socials',
        handler: () => {
          window.open("https://github.com/Jules02", "_blank");
        },
      },{
        id: 'social-linkedin',
        title: 'LinkedIn',
        section: 'Socials',
        handler: () => {
          window.open("https://www.linkedin.com/in/jules-dupont-0b5b9021a", "_blank");
        },
      },{
      id: 'light-theme',
      title: 'Change theme to light',
      description: 'Change the theme of the site to Light',
      section: 'Theme',
      handler: () => {
        setThemeSetting("light");
      },
    },
    {
      id: 'dark-theme',
      title: 'Change theme to dark',
      description: 'Change the theme of the site to Dark',
      section: 'Theme',
      handler: () => {
        setThemeSetting("dark");
      },
    },
    {
      id: 'system-theme',
      title: 'Use system default theme',
      description: 'Change the theme of the site to System Default',
      section: 'Theme',
      handler: () => {
        setThemeSetting("system");
      },
    },];
