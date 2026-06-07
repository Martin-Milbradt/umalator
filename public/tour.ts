import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

const TOUR_SEEN_KEY = 'umalator:tour-seen'

function buildTour() {
    return driver({
        showProgress: true,
        allowClose: true,
        smoothScroll: true,
        overlayOpacity: 0.65,
        stagePadding: 6,
        stageRadius: 4,
        progressText: '{{current}} of {{total}}',
        nextBtnText: 'Next →',
        prevBtnText: '← Back',
        doneBtnText: 'Done',
        onDestroyed: () => {
            try {
                localStorage.setItem(TOUR_SEEN_KEY, '1')
            } catch {
                // localStorage may be unavailable (private mode); not fatal
            }
        },
        steps: [
            {
                popover: {
                    title: 'Welcome to Umalator',
                    description:
                        'Quick tour of the interface. Use Next / Back, or Esc to exit. You can replay this tour anytime from the Help menu.',
                },
            },
            {
                element: '#add-skill-button',
                popover: {
                    title: 'Add skills',
                    description:
                        'Add skills you want to evaluate. Each skill gets simulated to estimate the mean length it gains. Hotkey: + (outside any input).',
                    side: 'right',
                },
            },
            {
                element: '#skills-container > div:first-child',
                popover: {
                    title: 'A skill row',
                    description:
                        'Each row is one skill. Click the name to rename or pick a different skill. The colored button on the left equips it on your uma — blue/grey + means available to add, red - means already equipped.',
                    side: 'right',
                },
            },
            {
                element: '#skills-container > div:first-child .discount-options',
                popover: {
                    title: 'Hint levels',
                    description:
                        'How much discount you have on the skill from supports. - means you have no hint, 0 means the skill is owned without a discount, and 10/20/30/35/40 are the percent discounts from hint levels.',
                    side: 'left',
                },
            },
            {
                element: '#skills-container > div:first-child .lock-btn',
                popover: {
                    title: 'Lock the default',
                    description:
                        'Save the current discount as the default for this skill. Reset (top right) restores every skill to its locked default. 🔒 means current discount equals the locked default; 🔓 means it differs.',
                    side: 'left',
                },
            },
            {
                element: '#filter-owned-button',
                popover: {
                    title: 'Filter the skill list',
                    description:
                        'Owned hides skills already on the uma. The Available dropdown picks Filtered (matches current distance/style), Hint, No Hint, or Unfiltered (every skill in the config).',
                    side: 'bottom',
                },
            },
            {
                element: '#config-select',
                popover: {
                    title: 'Configs',
                    description:
                        'Switch between saved configs. Configs are saved in this browser and auto-save as you edit. Use the Configs menu to share them across browsers and devices.',
                    side: 'bottom',
                },
            },
            {
                element: '#config-menu',
                popover: {
                    title: 'Duplicate / Import / Export / Delete',
                    description:
                        'Configs are JSON. Duplicate clones the current config under a new name. Export to share or back up; import to restore. Delete removes the current config.',
                    side: 'bottom',
                },
            },
            {
                element: '#uma-container',
                popover: {
                    title: 'Uma settings',
                    description:
                        'Stats, aptitudes, strategy, and currently-equipped skills for the runner you are evaluating.',
                    side: 'top',
                },
            },
            {
                element: '#track-container',
                popover: {
                    title: 'Track and race conditions',
                    description:
                        'Track, distance, mood, weather, season, ground. Use &lt;Random&gt; for any field to sample across values, or &lt;Sprint&gt;/&lt;Mile&gt;/&lt;Medium&gt;/&lt;Long&gt; to sample distance categories.',
                    side: 'top',
                },
            },
            {
                element: '#run-button',
                popover: {
                    title: 'Run the simulation',
                    description:
                        '500 simulations are run for every skill in parallel. Results sort by Mean / Cost (efficiency) by default.',
                    side: 'bottom',
                },
            },
            {
                element: '#results-table',
                popover: {
                    title: 'Reading the results',
                    description:
                        'Mean and Median are length gain in m. Cost is base SP cost; Disc is your discount. Mean/Cost is the efficiency. Min-Max is the extremes, Range is the spread of per-race outcomes, and Mean CI is how precisely the mean is estimated. Click headers to sort.',
                    side: 'top',
                },
            },
            {
                element: '#help-menu',
                popover: {
                    title: 'Help is here anytime',
                    description:
                        'Replay this tour, open the docs, file an issue, or join the Discord from this menu. Have fun!',
                    side: 'bottom',
                },
            },
        ],
    })
}

export function startTour(): void {
    buildTour().drive()
}

export function maybeAutoStartTour(): void {
    let seen: string | null = null
    try {
        seen = localStorage.getItem(TOUR_SEEN_KEY)
    } catch {
        return
    }
    if (seen) return
    requestAnimationFrame(() => {
        buildTour().drive()
    })
}
