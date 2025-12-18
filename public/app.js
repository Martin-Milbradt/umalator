let currentConfig = null;
let currentConfigFile = null;
let saveTimeout = null;
const tracknames = {
    10001: ["", "Sapporo"],
    10002: ["", "Hakodate"],
    10003: ["", "Niigata"],
    10004: ["", "Fukushima"],
    10005: ["", "Nakayama"],
    10006: ["", "Tokyo"],
    10007: ["", "Chukyo"],
    10008: ["", "Kyoto"],
    10009: ["", "Hanshin"],
    10010: ["", "Kokura"],
    10101: ["", "Ooi"],
};
let skillnames = null;
let skillNameToId = null;
let skillmeta = null;
let courseData = null;

(async function loadSkillnamesOnInit() {
    const response = await fetch("/api/skillnames");
    if (!response.ok) {
        throw new Error(`Failed to load skillnames: ${response.status} ${response.statusText}`);
    }
    skillnames = await response.json();
    if (!skillnames || typeof skillnames !== "object") {
        throw new Error("Invalid skillnames data received");
    }
    skillNameToId = Object.fromEntries(Object.entries(skillnames).map(([id, names]) => [names[0], id]));
})();

(async function loadSkillmetaOnInit() {
    const response = await fetch("/api/skillmeta");
    if (!response.ok) {
        throw new Error(`Failed to load skillmeta: ${response.status} ${response.statusText}`);
    }
    skillmeta = await response.json();
    if (!skillmeta || typeof skillmeta !== "object") {
        throw new Error("Invalid skillmeta data received");
    }
})();

async function waitForCourseData() {
    if (courseData) {
        return;
    }
    await new Promise((resolve) => {
        const checkCourseData = setInterval(() => {
            if (courseData) {
                clearInterval(checkCourseData);
                resolve();
            }
        }, 50);
        // Timeout after 5 seconds
        setTimeout(() => {
            clearInterval(checkCourseData);
            resolve();
        }, 5000);
    });
}

(async function loadCourseDataOnInit() {
    const response = await fetch("/api/coursedata");
    if (!response.ok) {
        throw new Error(`Failed to load course data: ${response.status} ${response.statusText}`);
    }
    courseData = await response.json();
    if (!courseData || typeof courseData !== "object") {
        throw new Error("Invalid course data received");
    }
    // Re-render track when course data is loaded in case it was rendered before data was available
    if (currentConfig) {
        renderTrack();
    }
})();

function normalizeSkillName(name) {
    return name.toLowerCase().trim().replace(/[◎○×]/g, "").replace(/\s+/g, " ").trim();
}

function getBaseSkillName(skillName) {
    return skillName.replace(/[◎○]$/, "").trim();
}

function getVariantsForBaseName(baseName) {
    if (!skillnames) return [];
    const variants = [];

    for (const [id, names] of Object.entries(skillnames)) {
        if (Array.isArray(names) && names[0]) {
            const name = names[0];
            if (name === baseName + " ○" || name === baseName + " ◎") {
                variants.push(name);
            }
        }
    }

    return variants;
}

function getOtherVariant(skillName) {
    if (!skillnames) return null;
    const baseName = getBaseSkillName(skillName);
    const hasCircle = skillName.endsWith(" ○");
    const hasDoubleCircle = skillName.endsWith(" ◎");

    if (!hasCircle && !hasDoubleCircle) {
        const variants = getVariantsForBaseName(baseName);
        if (variants.length === 2) {
            return variants;
        }
        return null;
    }

    const otherVariantName = hasCircle ? baseName + " ◎" : baseName + " ○";

    for (const [id, names] of Object.entries(skillnames)) {
        if (Array.isArray(names) && names[0] === otherVariantName) {
            return otherVariantName;
        }
    }

    return null;
}

function findSkillId(skillName) {
    if (skillNameToId[skillName]) {
        return skillNameToId[skillName];
    }

    const normalizedSkillName = normalizeSkillName(skillName);
    for (const [id, names] of Object.entries(skillnames)) {
        if (Array.isArray(names)) {
            for (const name of names) {
                if (name) {
                    const normalizedName = normalizeSkillName(name);
                    if (
                        normalizedName === normalizedSkillName ||
                        normalizedName.includes(normalizedSkillName) ||
                        normalizedSkillName.includes(normalizedName)
                    ) {
                        return id;
                    }
                }
            }
        }
    }

    return null;
}

function getSkillGroupId(skillName) {
    if (!skillmeta) return null;
    const skillId = findSkillId(skillName);
    if (!skillId) return null;
    return skillmeta[skillId]?.groupId || null;
}

async function loadConfigFiles() {
    const response = await fetch("/api/configs");
    const files = await response.json();
    const select = document.getElementById("config-select");
    select.innerHTML = "";
    files.forEach((file) => {
        const option = document.createElement("option");
        option.value = file;
        option.textContent = file;
        select.appendChild(option);
    });
    // Wait for course data to be loaded before loading config
    await waitForCourseData();
    if (files.length > 0) {
        await loadConfig(files[0]);
    }
}

async function loadConfig(filename) {
    const response = await fetch(`/api/config/${filename}`);
    const config = await response.json();
    currentConfig = config;
    currentConfigFile = filename;
    document.getElementById("config-select").value = filename;

    renderSkills();
    renderTrack();
    renderUma();
}

function deleteSkill(skillName) {
    const baseName = getBaseSkillName(skillName);
    const skillsToDelete = [baseName, baseName + " ○", baseName + " ◎"];
    skillsToDelete.forEach((skillToDelete) => {
        delete currentConfig.skills[skillToDelete];
    });
}

function renderSkills() {
    const container = document.getElementById("skills-container");
    container.innerHTML = "";
    const skills = currentConfig.skills;
    const umaSkills = currentConfig.uma?.skills || [];

    const skillNames = Object.keys(skills);
    const skillsToRender = new Set();
    const skillsToHide = new Set();

    skillNames.forEach((skillName) => {
        const baseName = getBaseSkillName(skillName);
        const variants = getVariantsForBaseName(baseName);

        if (variants.length === 2) {
            skillsToHide.add(baseName);
            variants.forEach((variantName) => {
                skillsToRender.add(variantName);
                if (!skills[variantName]) {
                    const baseSkill = skills[baseName] || skills[skillName];
                    skills[variantName] = {
                        discount:
                            baseSkill.discount !== null && baseSkill.discount !== undefined ? baseSkill.discount : null,
                    };
                } else {
                    const baseSkill = skills[baseName] || skills[skillName];
                    if (baseSkill.discount !== null && baseSkill.discount !== undefined) {
                        skills[variantName].discount = baseSkill.discount;
                    }
                }
            });
        } else {
            const otherVariant = getOtherVariant(skillName);
            if (otherVariant) {
                const variantsToAdd = Array.isArray(otherVariant) ? otherVariant : [otherVariant];
                variantsToAdd.forEach((variantName) => {
                    if (!skillsToRender.has(variantName)) {
                        skillsToRender.add(variantName);
                        if (!skills[variantName]) {
                            const baseSkill = skills[skillName];
                            skills[variantName] = {
                                discount:
                                    baseSkill.discount !== null && baseSkill.discount !== undefined
                                        ? baseSkill.discount
                                        : null,
                            };
                        } else {
                            const baseSkill = skills[skillName];
                            if (baseSkill.discount !== null && baseSkill.discount !== undefined) {
                                skills[variantName].discount = baseSkill.discount;
                            }
                        }
                    }
                });
            }
            if (!skillsToHide.has(skillName)) {
                skillsToRender.add(skillName);
            }
        }
    });

    const sortedSkillNames = Array.from(skillsToRender).sort((a, b) => {
        const idAStr = findSkillId(a);
        const idBStr = findSkillId(b);
        const idA = idAStr ? parseInt(idAStr) : 0;
        const idB = idBStr ? parseInt(idBStr) : 0;
        return idA - idB;
    });

    sortedSkillNames.forEach((skillName) => {
        const skill = skills[skillName];
        if (!skill) return;

        if (skill.discount === undefined) {
            skill.discount = null;
        }

        const div = document.createElement("div");
        div.className = "skill-item";
        div.dataset.skill = skillName;

        const currentDiscount = skill.discount;
        const discountOptions = [null, 0, 10, 20, 30, 35, 40];
        const discountButtonGroup = document.createElement("div");
        discountButtonGroup.className = "discount-button-group";
        discountButtonGroup.dataset.skill = skillName;

        discountOptions.forEach((value) => {
            const button = document.createElement("button");
            button.className = "discount-button";
            button.dataset.skill = skillName;
            button.dataset.discount = value === null ? "-" : value.toString();
            button.textContent = value === null ? "-" : value.toString();
            if (
                currentDiscount === value ||
                (value === null && (currentDiscount === null || currentDiscount === undefined))
            ) {
                button.classList.add("active");
            }
            discountButtonGroup.appendChild(button);
        });

        const lockButton = document.createElement("button");
        lockButton.className = "lock-button";
        lockButton.dataset.skill = skillName;
        const skillDefault = skill.default;
        const isDefaultActive = skillDefault !== undefined && skillDefault !== null && currentDiscount === skillDefault;
        const isDefaultNull =
            (skillDefault === undefined || skillDefault === null) &&
            (currentDiscount === null || currentDiscount === undefined);
        const isLocked = isDefaultActive || isDefaultNull;
        lockButton.textContent = isLocked ? "🔒" : "🔓";
        lockButton.title = isLocked ? "Remove default" : "Set current discount as default";
        lockButton.addEventListener("click", (e) => {
            e.stopPropagation();
            const skillName = e.target.dataset.skill;
            const currentDiscount = currentConfig.skills[skillName]?.discount;
            const skillDefault = currentConfig.skills[skillName]?.default;
            const isCurrentlyDefault =
                (skillDefault !== undefined && skillDefault !== null && currentDiscount === skillDefault) ||
                ((skillDefault === undefined || skillDefault === null) &&
                    (currentDiscount === null || currentDiscount === undefined));
            if (isCurrentlyDefault) {
                delete currentConfig.skills[skillName].default;
                const baseName = getBaseSkillName(skillName);
                const variants = getVariantsForBaseName(baseName);
                if (variants.length > 1) {
                    variants.forEach((variantName) => {
                        if (currentConfig.skills[variantName]) {
                            delete currentConfig.skills[variantName].default;
                        }
                    });
                } else {
                    const otherVariant = getOtherVariant(skillName);
                    if (otherVariant) {
                        const variantsToUpdate = Array.isArray(otherVariant) ? otherVariant : [otherVariant];
                        variantsToUpdate.forEach((variantName) => {
                            if (currentConfig.skills[variantName]) {
                                delete currentConfig.skills[variantName].default;
                            }
                        });
                    }
                }
            } else {
                if (currentDiscount === null || currentDiscount === undefined) {
                    delete currentConfig.skills[skillName].default;
                    const baseName = getBaseSkillName(skillName);
                    const variants = getVariantsForBaseName(baseName);
                    if (variants.length === 2) {
                        variants.forEach((variantName) => {
                            if (currentConfig.skills[variantName]) {
                                delete currentConfig.skills[variantName].default;
                            }
                        });
                    } else {
                        const otherVariant = getOtherVariant(skillName);
                        if (otherVariant) {
                            const variantsToUpdate = Array.isArray(otherVariant) ? otherVariant : [otherVariant];
                            variantsToUpdate.forEach((variantName) => {
                                if (currentConfig.skills[variantName]) {
                                    delete currentConfig.skills[variantName].default;
                                }
                            });
                        }
                    }
                } else {
                    currentConfig.skills[skillName].default = currentDiscount;
                    const baseName = getBaseSkillName(skillName);
                    const variants = getVariantsForBaseName(baseName);
                    if (variants.length === 2) {
                        variants.forEach((variantName) => {
                            if (currentConfig.skills[variantName]) {
                                currentConfig.skills[variantName].default = currentDiscount;
                            }
                        });
                    } else {
                        const otherVariant = getOtherVariant(skillName);
                        if (otherVariant) {
                            const variantsToUpdate = Array.isArray(otherVariant) ? otherVariant : [otherVariant];
                            variantsToUpdate.forEach((variantName) => {
                                if (currentConfig.skills[variantName]) {
                                    currentConfig.skills[variantName].default = currentDiscount;
                                }
                            });
                        }
                    }
                }
            }
            renderSkills();
            autoSave();
        });
        discountButtonGroup.appendChild(lockButton);

        const addToUmaButton = document.createElement("button");
        addToUmaButton.className = "add-to-uma-button";
        const isInUmaSkills = umaSkills.includes(skillName);
        const hasDiscount = skill.discount !== null && skill.discount !== undefined;
        if (isInUmaSkills) {
            addToUmaButton.textContent = "-";
            addToUmaButton.classList.add("red");
            addToUmaButton.title = "Remove from Uma skills";
        } else {
            addToUmaButton.textContent = "+";
            addToUmaButton.title = "Add to Uma skills";
            if (!hasDiscount) {
                addToUmaButton.classList.add("no-discount");
            }
        }
        addToUmaButton.dataset.skill = skillName;
        addToUmaButton.addEventListener("click", (e) => {
            e.stopPropagation();
            const skillName = e.target.dataset.skill;
            if (!currentConfig.uma) {
                currentConfig.uma = {};
            }
            if (!currentConfig.uma.skills) {
                currentConfig.uma.skills = [];
            }

            const currentlyInUmaSkills = currentConfig.uma.skills.includes(skillName);
            if (currentlyInUmaSkills) {
                const skillIndex = currentConfig.uma.skills.indexOf(skillName);
                if (skillIndex !== -1) {
                    currentConfig.uma.skills.splice(skillIndex, 1);
                }
            } else {
                // Use groupId to find and replace skills in the same group
                const newSkillGroupId = getSkillGroupId(skillName);
                let replaced = false;

                if (newSkillGroupId) {
                    for (let i = 0; i < currentConfig.uma.skills.length; i++) {
                        const existingSkill = currentConfig.uma.skills[i];
                        const existingGroupId = getSkillGroupId(existingSkill);
                        if (existingGroupId === newSkillGroupId) {
                            currentConfig.uma.skills[i] = skillName;
                            replaced = true;
                            break;
                        }
                    }
                }

                if (!replaced && !currentConfig.uma.skills.includes(skillName)) {
                    currentConfig.uma.skills.push(skillName);
                }
            }
            renderUma();
            renderSkills();
            autoSave();
        });

        const skillNameSpan = document.createElement("span");
        skillNameSpan.className = "skill-name-text";
        skillNameSpan.textContent = skillName;
        skillNameSpan.style.cursor = "pointer";
        skillNameSpan.title = "Click to edit skill name";
        skillNameSpan.dataset.skill = skillName;
        skillNameSpan.addEventListener("click", (e) => {
            e.stopPropagation();
            const skillName = e.target.dataset.skill;
            const originalName = skillName;
            const skillNameInput = document.createElement("input");
            skillNameInput.type = "text";
            skillNameInput.className = "skill-name-input";
            skillNameInput.value = originalName;
            skillNameInput.style.width = e.target.offsetWidth + "px";
            skillNameInput.style.minWidth = "100px";

            const restoreSpan = () => {
                renderSkills();
            };

            const handleBlur = () => {
                const newName = skillNameInput.value.trim();
                if (!newName) {
                    deleteSkill(originalName);
                    renderSkills();
                    renderUma();
                    autoSave();
                } else if (newName !== originalName && !currentConfig.skills[newName]) {
                    const skillData = currentConfig.skills[originalName];
                    deleteSkill(originalName);
                    currentConfig.skills[newName] = skillData;
                    renderSkills();
                    renderUma();
                    autoSave();
                } else {
                    restoreSpan();
                }
            };

            skillNameInput.addEventListener("blur", handleBlur);
            skillNameInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    skillNameInput.blur();
                } else if (e.key === "Escape") {
                    restoreSpan();
                }
            });

            e.target.parentNode.replaceChild(skillNameInput, e.target);
            skillNameInput.focus();
            skillNameInput.select();
        });

        const label = document.createElement("label");
        label.appendChild(skillNameSpan);

        div.appendChild(addToUmaButton);
        div.appendChild(label);
        div.appendChild(discountButtonGroup);

        container.appendChild(div);
    });

    container.querySelectorAll(".discount-button").forEach((button) => {
        button.addEventListener("click", (e) => {
            const skillName = e.target.dataset.skill;
            const discountValue = e.target.dataset.discount;
            const discount = discountValue === "-" ? null : parseInt(discountValue);
            if (!currentConfig.skills[skillName]) {
                currentConfig.skills[skillName] = {};
            }

            const currentDiscount = currentConfig.skills[skillName].discount;
            const isCurrentlyActive =
                (discount === null && (currentDiscount === null || currentDiscount === undefined)) ||
                (discount !== null && currentDiscount === discount);

            if (isCurrentlyActive) {
                const skillDefault = currentConfig.skills[skillName]?.default;
                const isCurrentlyDefault =
                    (skillDefault !== undefined && skillDefault !== null && currentDiscount === skillDefault) ||
                    ((skillDefault === undefined || skillDefault === null) &&
                        (currentDiscount === null || currentDiscount === undefined));

                if (isCurrentlyDefault) {
                    delete currentConfig.skills[skillName].default;
                    const baseName = getBaseSkillName(skillName);
                    const variants = getVariantsForBaseName(baseName);
                    if (variants.length === 2) {
                        variants.forEach((variantName) => {
                            if (currentConfig.skills[variantName]) {
                                delete currentConfig.skills[variantName].default;
                            }
                        });
                    } else {
                        const otherVariant = getOtherVariant(skillName);
                        if (otherVariant) {
                            const variantsToUpdate = Array.isArray(otherVariant) ? otherVariant : [otherVariant];
                            variantsToUpdate.forEach((variantName) => {
                                if (currentConfig.skills[variantName]) {
                                    delete currentConfig.skills[variantName].default;
                                }
                            });
                        }
                    }
                } else {
                    if (currentDiscount === null || currentDiscount === undefined) {
                        delete currentConfig.skills[skillName].default;
                        const baseName = getBaseSkillName(skillName);
                        const variants = getVariantsForBaseName(baseName);
                        if (variants.length === 2) {
                            variants.forEach((variantName) => {
                                if (currentConfig.skills[variantName]) {
                                    delete currentConfig.skills[variantName].default;
                                }
                            });
                        } else {
                            const otherVariant = getOtherVariant(skillName);
                            if (otherVariant) {
                                const variantsToUpdate = Array.isArray(otherVariant) ? otherVariant : [otherVariant];
                                variantsToUpdate.forEach((variantName) => {
                                    if (currentConfig.skills[variantName]) {
                                        delete currentConfig.skills[variantName].default;
                                    }
                                });
                            }
                        }
                    } else {
                        currentConfig.skills[skillName].default = currentDiscount;
                        const baseName = getBaseSkillName(skillName);
                        const variants = getVariantsForBaseName(baseName);
                        if (variants.length === 2) {
                            variants.forEach((variantName) => {
                                if (currentConfig.skills[variantName]) {
                                    currentConfig.skills[variantName].default = currentDiscount;
                                }
                            });
                        } else {
                            const otherVariant = getOtherVariant(skillName);
                            if (otherVariant) {
                                const variantsToUpdate = Array.isArray(otherVariant) ? otherVariant : [otherVariant];
                                variantsToUpdate.forEach((variantName) => {
                                    if (currentConfig.skills[variantName]) {
                                        currentConfig.skills[variantName].default = currentDiscount;
                                    }
                                });
                            }
                        }
                    }
                }
            } else {
                currentConfig.skills[skillName].discount = discount === null ? null : discount;

                const baseName = getBaseSkillName(skillName);
                const variants = getVariantsForBaseName(baseName);
                if (variants.length === 2) {
                    if (currentConfig.skills[baseName]) {
                        currentConfig.skills[baseName].discount = discount;
                    }
                    variants.forEach((variantName) => {
                        if (currentConfig.skills[variantName]) {
                            currentConfig.skills[variantName].discount = discount;
                        }
                    });
                } else {
                    const otherVariant = getOtherVariant(skillName);
                    if (otherVariant) {
                        const variantsToUpdate = Array.isArray(otherVariant) ? otherVariant : [otherVariant];
                        variantsToUpdate.forEach((variantName) => {
                            if (currentConfig.skills[variantName]) {
                                currentConfig.skills[variantName].discount = discount;
                            }
                        });
                        if (currentConfig.skills[baseName] && !skillName.endsWith(" ○") && !skillName.endsWith(" ◎")) {
                            currentConfig.skills[baseName].discount = discount;
                        }
                    }
                }
            }

            renderSkills();
            autoSave();
        });
    });
}

function calculateDropdownWidth(options) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    context.font = "13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
    let maxWidth = 0;
    options.forEach((opt) => {
        const width = context.measureText(opt).width;
        if (width > maxWidth) {
            maxWidth = width;
        }
    });
    return Math.max(maxWidth + 30, 60);
}

const DISTANCE_CATEGORIES = ["<Sprint>", "<Mile>", "<Medium>", "<Long>"];
const RANDOM_LOCATION = "<Random>";

function isRandomLocation(trackName) {
    return trackName && trackName.toLowerCase().trim() === "<random>";
}

function isDistanceCategory(distance) {
    if (!distance) return false;
    const normalized = distance.toString().toLowerCase().trim();
    return ["<sprint>", "<mile>", "<medium>", "<long>"].includes(normalized);
}

function getAvailableDistances(trackName, surface) {
    if (!courseData || !surface) {
        return DISTANCE_CATEGORIES;
    }

    const surfaceValue = surface.toLowerCase() === "turf" ? 1 : 2;
    if (surfaceValue === null) {
        return DISTANCE_CATEGORIES;
    }

    const isRandom = isRandomLocation(trackName);

    // For <Random> location, find all distances available for the surface
    if (isRandom) {
        const distances = new Set();
        for (const [courseId, rawCourse] of Object.entries(courseData)) {
            if (!rawCourse || typeof rawCourse !== "object") {
                continue;
            }
            if (rawCourse.surface === surfaceValue) {
                distances.add(rawCourse.distance);
            }
        }
        const distanceList = Array.from(distances)
            .sort((a, b) => a - b)
            .map((d) => d.toString());
        return [...DISTANCE_CATEGORIES, ...distanceList];
    }

    // For specific location, find distances for that track
    if (!trackName) {
        return DISTANCE_CATEGORIES;
    }

    const normalizedTrackName = trackName.toLowerCase();
    const trackId = Object.keys(tracknames).find((id) => tracknames[id][1]?.toLowerCase() === normalizedTrackName);
    if (!trackId) {
        return DISTANCE_CATEGORIES;
    }

    const distances = new Set();
    for (const [courseId, rawCourse] of Object.entries(courseData)) {
        if (!rawCourse || typeof rawCourse !== "object") {
            continue;
        }
        const raceTrackId = rawCourse.raceTrackId;
        if (raceTrackId == null) {
            continue;
        }
        if (raceTrackId.toString() === trackId && rawCourse.surface === surfaceValue) {
            distances.add(rawCourse.distance);
        }
    }

    const distanceList = Array.from(distances)
        .sort((a, b) => a - b)
        .map((d) => d.toString());
    return [...DISTANCE_CATEGORIES, ...distanceList];
}

function renderTrack() {
    const container = document.getElementById("track-container");
    container.innerHTML = "";
    const track = currentConfig.track || {};

    const trackLocations = Object.values(tracknames)
        .map((arr) => arr[1])
        .filter(Boolean)
        .sort();
    const locationOptions = [RANDOM_LOCATION, ...trackLocations];
    const locationWidth = locationOptions.length > 0 ? calculateDropdownWidth(locationOptions) : 120;

    const distanceOptions = getAvailableDistances(track.trackName, track.surface);
    const distanceWidth = distanceOptions.length > 0 ? calculateDropdownWidth(distanceOptions) : 60;

    const fields = [
        {
            key: "trackName",
            label: "Location",
            type: "select",
            options: locationOptions,
            width: locationWidth,
        },
        {
            key: "surface",
            label: "Surface",
            type: "select",
            options: ["Turf", "Dirt"],
            width: calculateDropdownWidth(["Turf", "Dirt"]),
        },
        {
            key: "distance",
            label: "Distance",
            type: "select",
            options: distanceOptions,
            width: distanceWidth,
            dynamic: true,
        },
        {
            key: "groundCondition",
            label: "Ground Condition",
            type: "select",
            options: ["Firm", "Good", "Soft", "Heavy"],
            width: calculateDropdownWidth(["Firm", "Good", "Soft", "Heavy"]),
        },
        {
            key: "weather",
            label: "Weather",
            type: "select",
            options: ["Sunny", "Cloudy", "Rainy", "Snowy"],
            width: calculateDropdownWidth(["Sunny", "Cloudy", "Rainy", "Snowy"]),
        },
        {
            key: "season",
            label: "Season",
            type: "select",
            options: ["Spring", "Summer", "Fall", "Winter", "Sakura"],
            width: calculateDropdownWidth(["Spring", "Summer", "Fall", "Winter", "Sakura"]),
        },
        { key: "numUmas", label: "Umas", type: "number", width: 50 },
        { key: "courseId", label: "Course ID", type: "text", width: 70 },
    ];

    const trackLine = document.createElement("div");
    trackLine.className = "track-line";

    fields.forEach((field, index) => {
        const wrapper = document.createElement("span");
        wrapper.className = "track-field-wrapper";

        const label = document.createElement("span");
        label.className = "track-label";
        label.textContent = `${field.label}: `;
        wrapper.appendChild(label);

        let input;
        if (field.type === "select") {
            input = document.createElement("select");
            input.className = "track-input";
            if (field.width) {
                input.style.width = `${field.width}px`;
            }
            field.options.forEach((opt) => {
                const option = document.createElement("option");
                option.value = opt;
                option.textContent = opt;
                const trackValue = track[field.key];
                // Handle both string and number comparisons, case-insensitive for special values
                const trackValueStr = trackValue?.toString()?.toLowerCase();
                const optLower = opt.toLowerCase();
                if (trackValue === opt || trackValueStr === opt || trackValueStr === optLower) {
                    option.selected = true;
                }
                input.appendChild(option);
            });
        } else {
            input = document.createElement("input");
            input.type = field.type;
            input.className = "track-input";
            const fieldValue = track[field.key];
            input.value = fieldValue === null || fieldValue === undefined ? "" : fieldValue;
            if (field.width) {
                input.style.width = `${field.width}px`;
            }
        }

        input.dataset.key = field.key;
        input.addEventListener("change", async (e) => {
            let value;
            if (field.type === "number") {
                const parsed = parseInt(e.target.value);
                value = e.target.value === "" || isNaN(parsed) ? null : parsed;
            } else {
                value = e.target.value;
            }
            if (!currentConfig.track) {
                currentConfig.track = {};
            }
            currentConfig.track[field.key] = value;

            if ((field.key === "trackName" || field.key === "surface") && field.key !== "distance") {
                // Wait for course data to be loaded if it's not available yet
                await waitForCourseData();

                const newTrackName = field.key === "trackName" ? value : currentConfig.track.trackName;
                const newSurface = field.key === "surface" ? value : currentConfig.track.surface;
                const newDistanceOptions = getAvailableDistances(newTrackName, newSurface);

                const distanceSelect = container.querySelector('select[data-key="distance"]');
                if (distanceSelect) {
                    const currentDistance = currentConfig.track.distance;
                    const currentDistanceStr = currentDistance?.toString();
                    distanceSelect.innerHTML = "";
                    newDistanceOptions.forEach((dist) => {
                        const option = document.createElement("option");
                        option.value = dist;
                        option.textContent = dist;
                        if (dist === currentDistanceStr || dist.toLowerCase() === currentDistanceStr?.toLowerCase()) {
                            option.selected = true;
                        }
                        distanceSelect.appendChild(option);
                    });

                    // Check if current distance is still in options (case-insensitive for categories)
                    const isCurrentDistanceValid = newDistanceOptions.some(
                        (opt) => opt === currentDistanceStr || opt.toLowerCase() === currentDistanceStr?.toLowerCase()
                    );
                    if (!isCurrentDistanceValid && newDistanceOptions.length > 0) {
                        distanceSelect.value = newDistanceOptions[0];
                        // Keep distance categories as strings, parse numbers
                        if (isDistanceCategory(newDistanceOptions[0])) {
                            currentConfig.track.distance = newDistanceOptions[0];
                        } else {
                            currentConfig.track.distance = parseInt(newDistanceOptions[0]);
                        }
                    } else if (newDistanceOptions.length === 0) {
                        currentConfig.track.distance = null;
                    }
                }
            } else if (field.key === "distance") {
                // Keep distance categories as strings, parse numbers
                if (isDistanceCategory(value)) {
                    currentConfig.track.distance = value;
                } else {
                    currentConfig.track.distance = parseInt(value);
                }
            }

            autoSave();
        });
        wrapper.appendChild(input);

        if (index < fields.length - 1) {
            const separator = document.createElement("span");
            separator.className = "track-separator";
            separator.textContent = ", ";
            wrapper.appendChild(separator);
        }

        trackLine.appendChild(wrapper);
    });

    container.appendChild(trackLine);
}

function renderUma() {
    const container = document.getElementById("uma-container");
    container.innerHTML = "";
    const uma = currentConfig.uma || {};

    const strategyOptions = ["Runaway", "Front Runner", "Pace Chaser", "Late Surger", "End Closer"];
    const aptitudeOptions = ["S", "A", "B", "C", "D", "E", "F", "G"];

    const fields = [
        { key: "speed", label: "SPD", type: "number", width: 65 },
        { key: "stamina", label: "STA", type: "number", width: 65 },
        { key: "power", label: "POW", type: "number", width: 65 },
        { key: "guts", label: "GUT", type: "number", width: 65 },
        { key: "wisdom", label: "WIT", type: "number", width: 65 },
        {
            key: "strategy",
            label: "Strategy",
            type: "select",
            options: strategyOptions,
            width: calculateDropdownWidth(strategyOptions),
        },
        {
            key: "distanceAptitude",
            label: "Distance",
            type: "select",
            options: aptitudeOptions,
            width: 35,
        },
        {
            key: "surfaceAptitude",
            label: "Surface",
            type: "select",
            options: aptitudeOptions,
            width: 35,
        },
        {
            key: "styleAptitude",
            label: "Style",
            type: "select",
            options: aptitudeOptions,
            width: 35,
        },
        { key: "mood", label: "Mood", type: "number", width: 45 },
        { key: "unique", label: "Unique", type: "text", width: 280 },
    ];

    const createUmaField = (field, isLast) => {
        const wrapper = document.createElement("span");
        wrapper.className = "uma-field-wrapper";

        const label = document.createElement("span");
        label.className = "uma-label";
        label.textContent = `${field.label}: `;
        wrapper.appendChild(label);

        let input;
        if (field.type === "select") {
            input = document.createElement("select");
            input.className = "uma-input";
            if (field.width) {
                input.style.width = `${field.width}px`;
            }
            field.options.forEach((opt) => {
                const option = document.createElement("option");
                option.value = opt;
                option.textContent = opt;
                if (uma[field.key] === opt) {
                    option.selected = true;
                }
                input.appendChild(option);
            });
        } else {
            input = document.createElement("input");
            input.type = field.type;
            input.className = "uma-input";
            const fieldValue = uma[field.key];
            input.value = fieldValue === null || fieldValue === undefined ? "" : fieldValue;
            if (field.width) {
                input.style.width = `${field.width}px`;
            }
        }

        input.dataset.key = field.key;
        input.addEventListener("change", (e) => {
            let value;
            if (field.type === "number") {
                const parsed = parseInt(e.target.value);
                value = e.target.value === "" || isNaN(parsed) ? null : parsed;
            } else {
                value = e.target.value;
            }
            if (!currentConfig.uma) {
                currentConfig.uma = {};
            }
            currentConfig.uma[field.key] = value;
            autoSave();
        });
        wrapper.appendChild(input);

        if (!isLast) {
            const separator = document.createElement("span");
            separator.className = "uma-separator";
            separator.textContent = ", ";
            wrapper.appendChild(separator);
        }

        return wrapper;
    };

    const line1 = document.createElement("div");
    line1.className = "uma-line";
    fields.slice(0, 6).forEach((field, index) => {
        line1.appendChild(createUmaField(field, index === 5));
    });
    container.appendChild(line1);

    const line2 = document.createElement("div");
    line2.className = "uma-line";
    fields.slice(6).forEach((field, index) => {
        line2.appendChild(createUmaField(field, index === fields.slice(6).length - 1));
    });
    container.appendChild(line2);

    const skillsDiv = document.createElement("div");
    skillsDiv.className = "uma-line";
    const skillsWrapper = document.createElement("span");
    skillsWrapper.className = "uma-field-wrapper";
    skillsWrapper.style.flex = "1";
    skillsWrapper.style.minWidth = "0";
    const skillsLabel = document.createElement("span");
    skillsLabel.className = "uma-label";
    skillsLabel.textContent = "Skills: ";
    skillsWrapper.appendChild(skillsLabel);
    const skillsInput = document.createElement("input");
    skillsInput.type = "text";
    skillsInput.className = "uma-input";
    skillsInput.style.flex = "1";
    skillsInput.style.minWidth = "0";
    skillsInput.value = (uma.skills || []).join(", ");
    skillsInput.addEventListener("change", (e) => {
        if (!currentConfig.uma) {
            currentConfig.uma = {};
        }
        currentConfig.uma.skills = e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        autoSave();
    });
    skillsWrapper.appendChild(skillsInput);
    skillsDiv.appendChild(skillsWrapper);
    container.appendChild(skillsDiv);
}

async function saveConfig() {
    if (!currentConfigFile) return;

    try {
        await fetch(`/api/config/${currentConfigFile}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(currentConfig),
        });
    } catch (error) {
        console.error("Error saving config:", error);
    }
}

function autoSave() {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
        saveConfig();
    }, 500);
}

async function runCalculations() {
    const button = document.getElementById("run-button");
    const output = document.getElementById("terminal-output");
    button.disabled = true;
    output.textContent = "Running calculations...\n";

    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    await saveConfig();

    try {
        const response = await fetch(`/api/run?configFile=${encodeURIComponent(currentConfigFile)}`, {
            method: "GET",
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (!response.body) {
            throw new Error("Response body is null");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            let result;
            try {
                result = await reader.read();
            } catch (readError) {
                console.error("Error reading stream:", readError);
                button.disabled = false;
                output.textContent += `\n\nError reading stream: ${readError.message}`;
                break;
            }

            const { done, value } = result;
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n");

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === "started") {
                            continue;
                        } else if (data.type === "output") {
                            output.textContent += data.data;
                            output.scrollTop = output.scrollHeight;
                        } else if (data.type === "done") {
                            button.disabled = false;
                            if (data.code !== null && data.code !== 0) {
                                output.textContent += `\n\nProcess exited with code ${data.code}`;
                            } else if (data.code === null) {
                                if (data.signal) {
                                    output.textContent += `\n\nProcess terminated by signal: ${data.signal}`;
                                } else if (!data.output || data.output.trim().length === 0) {
                                    output.textContent += `\n\nProcess exited without output. Make sure cli.js is built (run 'npm run build') and all dependencies are available.`;
                                }
                            }
                        } else if (data.type === "error") {
                            button.disabled = false;
                            output.textContent += `\n\nError: ${data.error}`;
                        }
                    } catch (parseError) {
                        console.error("Error parsing SSE data:", parseError, line);
                    }
                }
            }
        }
    } catch (error) {
        button.disabled = false;
        output.textContent += `\n\nError: ${error.message}`;
    }
}

function resetUmaSkills() {
    if (!currentConfig.uma) {
        currentConfig.uma = {};
    }
    currentConfig.uma.skills = [];

    if (currentConfig.skills) {
        Object.keys(currentConfig.skills).forEach((skillName) => {
            const skill = currentConfig.skills[skillName];
            if (skill.default !== undefined && skill.default !== null) {
                currentConfig.skills[skillName].discount = skill.default;
            } else {
                currentConfig.skills[skillName].discount = null;
            }
        });
    }

    renderUma();
    renderSkills();
    autoSave();
}

document.getElementById("config-select").addEventListener("change", (e) => {
    loadConfig(e.target.value);
});

document.getElementById("duplicate-config-button").addEventListener("click", async () => {
    if (!currentConfigFile) {
        alert("No config file selected");
        return;
    }

    const newName = prompt("Enter name for duplicated config file:");
    if (!newName || !newName.trim()) {
        return;
    }

    let trimmedName = newName.trim();
    if (!trimmedName.toLowerCase().endsWith(".json")) {
        trimmedName += ".json";
    }

    try {
        const response = await fetch(`/api/config/${encodeURIComponent(currentConfigFile)}/duplicate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ newName: trimmedName }),
        });

        if (!response.ok) {
            let errorMessage = "Failed to duplicate config file";
            try {
                const error = await response.json();
                errorMessage = error.error || errorMessage;
            } catch (parseError) {
                const text = await response.text();
                errorMessage = text || errorMessage;
            }
            alert(`Error: ${errorMessage}`);
            return;
        }

        await loadConfigFiles();
        await loadConfig(trimmedName);
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
});

document.getElementById("run-button").addEventListener("click", runCalculations);

document.getElementById("reset-button").addEventListener("click", resetUmaSkills);

document.getElementById("add-skill-button").addEventListener("click", () => {
    if (!currentConfig.skills) {
        currentConfig.skills = {};
    }
    const newSkillName = "New Skill";
    let counter = 1;
    let finalName = newSkillName;
    while (currentConfig.skills[finalName]) {
        finalName = `${newSkillName} ${counter}`;
        counter++;
    }
    currentConfig.skills[finalName] = {
        discount: 0,
    };
    renderSkills();

    setTimeout(() => {
        const skillItem = document.querySelector(`[data-skill="${finalName}"]`);
        if (skillItem) {
            const editButton = skillItem.querySelector(".edit-skill-button");
            if (editButton) {
                editButton.click();
            }
        }
    }, 100);

    autoSave();
});

loadConfigFiles();
