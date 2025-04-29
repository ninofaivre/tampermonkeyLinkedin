let pouletToggleEnabled = localStorage.getItem('pouletToggleState') == "true";

function getPixelColor(imgElement, x, y) {
    if (imgElement.crossOrigin != "anonymous") {
        console.log("WTF wrong call of getPixelColor")
    }
    // Créer un canvas et dessiner l'image dessus
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    // Ajuster la taille du canvas à celle de l'image
    canvas.width = imgElement.width;
    canvas.height = imgElement.height;
    context.drawImage(imgElement, 0, 0);
    // Récupérer les données RGBA du pixel à (x, y)
    const { data } = context.getImageData(x, y, 1, 1);
    return [data[0], data[1], data[2]]
}

async function getCopyOfImageWithCORS(image) {
    return new Promise((resolve, reject) => {
        let newImage = new Image()
        newImage.crossOrigin = "anonymous"
        newImage.onload = (event) => { resolve(event.target) }
        newImage.src = image.src
    })
}

async function removeElementIfImageNonOpenToWork(image, element) {
    if (image === null) {
        if (element.querySelector('div.EntityPhoto-circle-3-ghost-person') !== null) {
            //element.innerHTML += "GHOST"
            element.remove()
            return
        }
        //element.innerHTML += "NULL"
        element.remove()
        return
    }
    if (image.crossOrigin !== "anonymous") {
        image = await getCopyOfImageWithCORS(image)
    }
    try {
        const colors = getPixelColor(image, 1, image.height - 5)
        if (!(colors[0] < 80 && colors[1] > 100 && colors[2] < 70)) {
            //element.innerHTML += "NON OPEN FOR WORK"
            element.remove()
        } else {
            //element.innerHTML += "OPEN FOR WORK"
        }
    } catch (e) {
        console.log(element.outerText.split('\n')[0], ": THROW")
        console.log(image.src, image.crossOrigin)
        console.log(e)
        //element.remove()
    }
}

async function extractImageFromSchoolLi(li) {
    return li.querySelector('img[id*="org-people-profile-card__profile-image"]') ?? li.querySelector('div.org-people-profile-card__profile-info img[id*="ember"]')
}

function schoolListMutationListener(mutationList, observer) {
    console.log("scrollList mutation")
    mutationList.forEach(mutation => {
        if (mutation.oldValue !== null) {
            return
        }
        mutation.addedNodes.forEach(async node => {
            if (node.nodeName !== "LI") {
                return
            }
            removeElementIfImageNonOpenToWork(await extractImageFromSchoolLi(node), node)
        })
    })
}

// pareil que ci-dessous
async function extractImageFromSearchLi(li) {
    return new Promise((resolve, reject) => {
        const image = li.querySelector('img.presence-entity__image')
        if (image !== null) {
            resolve(image)
            return
        }
        if (li.querySelector('a.artdeco-button--premium') !== null) { // ADS
            resolve(null)
            return
        }
        (new MutationObserver((mutationList, observer) => {
            if (li.querySelector('div.EntityPhoto-circle-3-ghost-person') !== null) {
                observer.disconnect()
                resolve(null)
                return
            }
            const image = li.querySelector('img.presence-entity__image')
            if (image === null) {
                return
            }
            observer.disconnect()
            resolve(image)
        })).observe(li, { childList: true, subtree: true, attributes: true })
    })
}

// sera probablement factorisé avec schoolListMutationListener plus tard
function searchListMutationListener(mutationList, observer) {
    console.log("searchList mutation")
    console.log("mutation list :", mutationList)
    mutationList.forEach(mutation => {
        mutation.addedNodes.forEach(async node => {
            if (node.nodeName !== "LI") {
                return
            }
            console.log("added li mutation :", node.outerText.split('\n')[0])
            removeElementIfImageNonOpenToWork(await extractImageFromSearchLi(node), node)
        })
    })
}

let observersList = []

function clearPouletListeners() {
    observersList.forEach(observer => {
        observer.disconnect()
    })
    observersList = []
}

async function getLoadingElementFromApplicationOutlet(selector) {
    return new Promise((resolve, reject) => {
        const queryResult = document.querySelector('div.application-outlet ' + selector)
        if (queryResult !== null) {
            resolve(queryResult)
            return
        }
        const applicationOutletElement = document.querySelector('div.application-outlet')
        const applicationOutletObserver = new MutationObserver((mutationList, observer) => {
            const queryResult = applicationOutletElement.querySelector(selector)
            if (queryResult === null) {
                return
            }
            observer.disconnect()
            resolve(queryResult)
        })
        applicationOutletObserver.observe(applicationOutletElement, { childList: true, subtree: true })
    })
}

async function schoolListener() {
    console.log('ancien élèves')
    const scrollList = await getLoadingElementFromApplicationOutlet('div.scaffold-finite-scroll ul')
    if (pouletToggleEnabled === false) {
        return
    }
    for (const node of Array.from(scrollList.children)) {
        if (node.nodeName !== "LI") {
            continue
        }
        removeElementIfImageNonOpenToWork(await extractImageFromSchoolLi(node), node)
    }
    const schoolObserver = new MutationObserver(schoolListMutationListener)
    schoolObserver.observe(scrollList, { childList: true })
    observersList.push(schoolObserver)
}

async function jj(searchResultElement) {
    if (!searchResultElement.poulet) {
        searchResultElement.poulet = {}
    }
    searchResultElement.poulet.processed = true
    const searchResultObserver = new MutationObserver(searchListMutationListener)
    searchResultObserver.observe(searchResultElement, { childList: true })
    observersList.push(searchResultObserver)

    let i = 0
    for (const node of Array.from(searchResultElement.children)) {
        if (node.nodeName !== "LI") {
            continue
        }
        i++
        extractImageFromSearchLi(node)
            .then((image) => removeElementIfImageNonOpenToWork(image, node))
    }
    console.log("i :", i)
}

function searchResultContainerMutationListener(mutationList, observer) {
    for (const mutation of mutationList) {
        for (const node of mutation.addedNodes) {
            if (node.nodeName !== "DIV") {
                continue
            }
            const searchResultElement = node.querySelector('ul li div[data-view-name="search-entity-result-universal-template"]')?.closest('ul')
            if (!searchResultElement) {
                continue
            }
            if (!searchResultElement.poulet?.processed) {
                jj(searchResultElement)
            }
        }
    }
}

async function searchListener() {
    console.log("searchListener called")
    const searchResultElement = (await getLoadingElementFromApplicationOutlet('div.search-results-container ul li div[data-view-name="search-entity-result-universal-template"]')).closest('ul')

    const searchResultContainerElement = searchResultElement.closest('div').parentElement.parentElement
    const searchResultContainerObserver = new MutationObserver(searchResultContainerMutationListener)
    searchResultContainerObserver.observe(searchResultContainerElement, { childList: true })
    observersList.push(searchResultContainerObserver)

    jj(searchResultElement)
}

function setPouletListeners(url) {
    clearPouletListeners()
    if (pouletToggleEnabled === false) {
        return
    }
    if (/^.*\/school\/.+\/(people|PEOPLE)\/$/.test(url) || /^.*\/school\/.+\/(people|PEOPLE)\/?.*$/.test(url)) {
        schoolListener()
    }
    if (/^.*\/search\/results\/(people|PEOPLE)\/.*$/.test(url)) {
        searchListener()
    }
}

function setPushStateListener() {
    const originalHistoryPushState = history.pushState
    history.pushState = function(state, title, url) {
        setPouletListeners(url)
        return originalHistoryPushState.apply(history, arguments)
    }
}

function buttonClickListener() {
    pouletToggleEnabled = !pouletToggleEnabled
    updateButtonAndStorage()
    setPouletListeners(window.location.href)
}

function updateButtonAndStorage() {
    const bouton = document.querySelector('#pouletToggle')
    if (pouletToggleEnabled) {
        bouton.innerHTML = 'ON'
        bouton.style.backgroundColor = '#28a745';
        localStorage.setItem('pouletToggleState', true)
    } else {
        bouton.innerHTML = 'OFF'
        bouton.style.backgroundColor = '#ff0000';
        localStorage.setItem('pouletToggleState', false)
    }
}

function initButton() {
    if (document.getElementById("pouletToggle") !== null) {
        alert("tentative de créer le bouton qui existe déjà, ne devrais pas arriver")
    }
    const bouton = document.createElement('button');
    bouton.id = 'pouletToggle'; // Optionnel, si tu veux lui donner un ID spécifique

    // Style du bouton pour le positionner par-dessus la page
    bouton.style.position = 'fixed';
    bouton.style.top = '10px';
    bouton.style.right = '100px';
    bouton.style.zIndex = '1000'; // Assure que le bouton est au-dessus des autres éléments
    bouton.style.padding = '10px';
    bouton.style.color = 'white';
    bouton.style.border = 'none';
    bouton.style.borderRadius = '5px';
    bouton.style.cursor = 'pointer';
    bouton.style.fontSize = '16px';

    // Ajout de l'événement "click" pour appeler la fonction
    bouton.addEventListener('click', () => {buttonClickListener()});

    // Ajout du bouton au body de la page
    document.body.appendChild(bouton);
    updateButtonAndStorage()
}

(function() {
    initButton()
    window.addEventListener('storage', function(event) {
        if (event.key != 'pouletToggleState') { return }
        if (event.oldValue == event.newValue) { return }
        buttonClickListener()
    });
    setPouletListeners(window.location.href)
    setPushStateListener()
    window.onpopstate = function(event) {
        setPouletListeners(window.location.href)
    }
})();
