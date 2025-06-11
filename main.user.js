const nativeLocalStorageSetter = Storage.prototype.setItem
const nativeLocalStorageGetter = Storage.prototype.getItem

// WARN : currently only using a shallow copy, need to switch
// to a deep copy if defaultSettings starts having subObjs
const defaultSettings = {
  displayMode: false,
  schoolAutoLoad: 'auto',
  schoolAutoLoadWaitingTimeMs: 200
}

const settings = {}
let currentSchoolLoadButton = null

function initSettings() {
  storedSettings = nativeLocalStorageGetter.call(localStorage, 'pouletSettings')
  let newSettings
  if (storedSettings == null)
    settingsChangedHandler(defaultSettings)
  else
    settingsChangedHandler(Object.assign({}, defaultSettings, (() => {
      try { return JSON.parse(storedSettings) }
      catch { return {} }
    })()))
}

let pouletToggleEnabled = nativeLocalStorageGetter.call(localStorage, 'pouletToggleState') == "true";

async function sleep (delay) {
  return new Promise((resolve) => setTimeout(resolve, delay))
}

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
  console.log("schoolList mutation")
  mutationList.forEach(mutation => {
    if (mutation.oldValue !== null) {
      return
    }
    mutation.addedNodes.forEach(async node => {
      if (node.nodeName === "LI") {
        removeElementIfImageNonOpenToWork(await extractImageFromSchoolLi(node), node)
      }
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

async function schoolListListener(schoolListEl) {
  for (const node of Array.from(schoolListEl.children)) {
    if (node.nodeName !== "LI") {
      continue
    }
    removeElementIfImageNonOpenToWork(await extractImageFromSchoolLi(node), node)
  }
  const schoolObserver = new MutationObserver(schoolListMutationListener)
  schoolObserver.observe(schoolListEl, { childList: true })
  observersList.push(schoolObserver)
}

async function schoolLoadButtonListener(loadButtonEl) {
  currentSchoolLoadButton = loadButtonEl
  if (settings.schoolAutoLoad === 'disabled')
    return
  await sleep(settings.schoolAutoLoadWaitingTimeMs)
  loadButtonEl.click()
}

function initSchoolLoadButtonObserver(observerTarget) {
  const loadButtonObserver = new MutationObserver((mutationList, observer) => {
    for (const mutation of mutationList) {
      for (const node of mutation.addedNodes) {
        if (node.nodeName !== 'DIV')
          continue
        const loadButtonEl = node.querySelector('button.scaffold-finite-scroll__load-button')
        if (loadButtonEl !== null) {
          schoolLoadButtonListener(loadButtonEl)
          return
        }
      }
    }
  })
  loadButtonObserver.observe(observerTarget, { childList: true })
  observersList.push(loadButtonObserver)
}

async function schoolListener() {
  const scaffoldFiniteScrollEl = await getLoadingElementFromApplicationOutlet('div.scaffold-finite-scroll')
  if (pouletToggleEnabled === true) {
    schoolListListener(scaffoldFiniteScrollEl.querySelector('ul'))
  }
  const loadButtonEl = scaffoldFiniteScrollEl.querySelector('button.scaffold-finite-scroll__load-button')
  currentSchoolLoadButton = loadButtonEl
  if (settings.schoolAutoLoad === 'auto')
    loadButtonEl.click()
  initSchoolLoadButtonObserver(scaffoldFiniteScrollEl.querySelector(':scope > div:nth-of-type(2)'))
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
  const searchResultElement = (await getLoadingElementFromApplicationOutlet('div.search-results-container ul li div[data-view-name="search-entity-result-universal-template"]')).closest('ul')

  const searchResultContainerElement = searchResultElement.closest('div').parentElement.parentElement
  const searchResultContainerObserver = new MutationObserver(searchResultContainerMutationListener)
  searchResultContainerObserver.observe(searchResultContainerElement, { childList: true })
  observersList.push(searchResultContainerObserver)

  jj(searchResultElement)
}

function setPouletListeners(url) {
  clearPouletListeners()
  document.getElementById('pouletInfos').infos.mode = null;
  if (pouletToggleEnabled === false) {
    return
  }
  if (/^.*\/school\/.+\/(people|PEOPLE)\/$/.test(url) || /^.*\/school\/.+\/(people|PEOPLE)\/?.*$/.test(url)) {
    document.getElementById('pouletInfos').infos.mode = 'school/people';
    schoolListener()
  }
  if (/^.*\/company\/.+\/(people|PEOPLE)\/$/.test(url) || /^.*\/company\/.+\/(people|PEOPLE)\/?.*$/.test(url)) {
    document.getElementById('pouletInfos').infos.mode = 'company/people';
    schoolListener()
  }
  if (/^.*\/search\/results\/(people|PEOPLE)\/.*$/.test(url)) {
    document.getElementById('pouletInfos').infos.mode = 'search/people';
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

function settingsChangedHandler(changed) {
  if (changed.displayMode !== undefined) {
    const infosModeEl = document.getElementById('pouletInfos').querySelector('[data-id="mode"]')
    infosModeEl.style.display = changed.displayMode && "block" || "none"
    document.getElementById('pouletSettings').shadowRoot.getElementById('displayModeCheckBox').checked = changed.displayMode
  }
  if (changed.schoolAutoLoad) {
    const schoolAutoLoadSelectEl = document.getElementById('pouletSettings')
      .shadowRoot
      .getElementById('schoolAutoLoadSelect')
    schoolAutoLoadSelectEl.value = changed.schoolAutoLoad
    if (
        changed.schoolAutoLoad === 'auto' &&
        currentSchoolLoadButton !== null &&
        document.contains(currentSchoolLoadButton)
      ) {
      currentSchoolLoadButton.click()
    }
  }
  if (changed.schoolAutoLoadWaitingTimeMs !== undefined) {
    const schoolAutoLoadWaitingTimeInputEl = document.getElementById('pouletSettings')
      .shadowRoot
      .getElementById('schoolAutoLoadWaitingTimeInput')
    schoolAutoLoadWaitingTimeInputEl.value = changed.schoolAutoLoadWaitingTimeMs
  }
  Object.assign(settings, changed)
  nativeLocalStorageSetter.call(localStorage, 'pouletSettings', JSON.stringify(settings))
}

function updateButtonAndStorage() {
  const toggleEl = document.querySelector('#pouletToggle')
  if (pouletToggleEnabled) {
    toggleEl.innerHTML = 'ON'
    toggleEl.style.backgroundColor = '#28a745';
    console.log("setting pouletToggleState to true in localStorage") 
    nativeLocalStorageSetter.call(localStorage, 'pouletToggleState', true)
  } else {
    toggleEl.innerHTML = 'OFF'
    toggleEl.style.backgroundColor = '#ff0000';
    console.log("setting pouletToggleState to false in localStorage") 
    nativeLocalStorageSetter.call(localStorage, 'pouletToggleState', false)
  }
}

function settingsClickOutHandler(settingsEl, settingsButtonEl, event) {
  if (
      settingsEl.contains(event.target) ||
      settingsButtonEl.contains(event.target) ||
      (
        currentSchoolLoadButton != null &&
        document.contains(currentSchoolLoadButton) &&
        currentSchoolLoadButton.contains(event.target)
      )
    )
    return
  closeSettings(settingsEl)
}

function settingsEscapeHandler(settingsEl, event) {
  if (event.key !== 'Escape')
    return
  closeSettings(settingsEl)
}

function settingsClearCloseHandlers() {
  document.removeEventListener('click', settingsClickOutHandler)
  document.removeEventListener('keydown', settingsEscapeHandler)
}

function closeSettings(settingsEl) {
  settingsClearCloseHandlers()
  settingsEl.style.display = "none"
}

function settingsButtonHandler(settingsEl, settingsButtonEl) {
  if (settingsEl.style.display == "block") {
    closeSettings(settingsEl)
    return
  }
  settingsEl.style.display = "block"
  document.addEventListener('keydown', (event) => {
    settingsEscapeHandler(settingsEl, event)
  })
  setTimeout(() => {
    document.addEventListener('click', (event) => {
      settingsClickOutHandler(settingsEl, settingsButtonEl, event)
    })
  }, 0)
}

function initHud() {
  if (document.getElementById("pouletHud") !== null) {
    alert("tentative de créer le hud qui existe déjà, ne devrais pas arriver")
  }
  const hudEl = document.createElement('div');
  hudEl.id = 'pouletHud';
  const shortcutsEl = document.createElement('div')
  Object.entries({
  	position: 'fixed',
  	top: '10px',
  	right: '100px',
  	"z-index": 1000,
    height: '32px',
    display: 'flex',
  }).forEach(([key, value]) => { shortcutsEl.style.setProperty(key, value); });
  Object.entries({
  	position: 'fixed',
  	top: '50px',
  	right: shortcutsEl.style.right,
  	"z-index": shortcutsEl.style.zIndex,
  }).forEach(([key, value]) => { hudEl.style.setProperty(key, value); });

  const toggleEl = document.createElement('button');
  toggleEl.id = 'pouletToggle';
  Object.entries({
  	padding: '5px',
    'margin-right': '5px',
  	color: 'white',
  	border: 'none',
  	"border-radius": '5px',
  	cursor: 'pointer',
  	fontSize: '16px',
  }).forEach(([key, value]) => { toggleEl.style.setProperty(key, value); });

  // Ajout de l'événement "click" pour appeler la fonction
  toggleEl.addEventListener('click', buttonClickListener);

  const infosEl = document.createElement('div');
  infosEl.id = 'pouletInfos';
  const infosModeEl = document.createElement('p')
  infosModeEl.dataset["id"] = 'mode'
  infosModeEl.style.display = "none"
  infosEl.infos = new Proxy({ mode: null }, {
    set(target, prop, value) {
      if (value === target[prop])
        return
      target[prop] = value;
      if (prop === "mode") {
        infosModeEl.innerText = value && `mode : ${value}` || ""
      }
    }
  });
  infosEl.append(infosModeEl)

  const settingsEl = document.createElement('div')
  const settingsElShadow = settingsEl.attachShadow({ mode: 'open' })
  settingsEl.id = 'pouletSettings'
  const displayModeCheckBoxEl = document.createElement('input')
  displayModeCheckBoxEl.id = 'displayModeCheckBox'
  displayModeCheckBoxEl.type = "checkbox"
  displayModeCheckBoxEl.addEventListener('click', (event) => {
    settingsChangedHandler({ displayMode: event.target.checked })
  })
  displayModeLabelEl = document.createElement('label')
  displayModeLabelEl.htmlFor = displayModeCheckBoxEl.id
  displayModeLabelEl.innerText = 'display mode'
  schoolAutoLoadSelectEl = document.createElement('select')
  schoolAutoLoadSelectEl.id = 'schoolAutoLoadSelect'
  schoolAutoLoadSelectEl.addEventListener("change", (event) => {
    settingsChangedHandler({ schoolAutoLoad: event.target.value })
  })
  schoolAutoLoadOptionDisabledEl = document.createElement('option')
  schoolAutoLoadOptionDisabledEl.value = "disabled"
  schoolAutoLoadOptionDisabledEl.innerText = "disabled"
  schoolAutoLoadOptionOnClickEl = document.createElement('option')
  schoolAutoLoadOptionOnClickEl.value = "onClick"
  schoolAutoLoadOptionOnClickEl.innerText = "on click"
  schoolAutoLoadOptionAutoEl = document.createElement('option')
  schoolAutoLoadOptionAutoEl.value = "auto"
  schoolAutoLoadOptionAutoEl.innerText = "auto"
  schoolAutoLoadSelectEl.append(
    schoolAutoLoadOptionDisabledEl,
    schoolAutoLoadOptionOnClickEl,
    schoolAutoLoadOptionAutoEl
  )
  schoolAutoLoadLabelEl = document.createElement('label')
  schoolAutoLoadLabelEl.for = schoolAutoLoadSelectEl.id
  schoolAutoLoadLabelEl.innerText = 'school auto load '
  schoolAutoLoadWaitingTimeInputEl = document.createElement('input')
  schoolAutoLoadWaitingTimeInputEl.type = 'text'
  schoolAutoLoadWaitingTimeInputEl.id = 'schoolAutoLoadWaitingTimeInput'
  schoolAutoLoadWaitingTimeInputEl.addEventListener('input', (event) => {
    const value = parseInt(event.target.value)
    settingsChangedHandler({ schoolAutoLoadWaitingTimeMs: value !== NaN && value || 0 })
  })
  schoolAutoLoadWaitingTimeLabelEl = document.createElement('label')
  schoolAutoLoadWaitingTimeLabelEl.htmlFor = schoolAutoLoadWaitingTimeInputEl.id
  schoolAutoLoadWaitingTimeLabelEl.innerText = 'school auto load delay (ms) '
  resetSettingsButtonEl = document.createElement('button')
  resetSettingsButtonEl.innerText = 'reset settings'
  resetSettingsButtonEl.addEventListener('click', () => {
    settingsChangedHandler(defaultSettings)
  })
  settingsElShadow.append(
    displayModeLabelEl, displayModeCheckBoxEl, document.createElement('br'),
    schoolAutoLoadLabelEl, schoolAutoLoadSelectEl, document.createElement('br'),
    schoolAutoLoadWaitingTimeLabelEl, schoolAutoLoadWaitingTimeInputEl, document.createElement('br'),
    resetSettingsButtonEl
  )
  Object.entries({
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    'background-color': 'rgba(140, 140, 140, 0.65 )',
    'border-radius': '6px',
    padding: '20px',
    'backdrop-filter': 'blur(2px)',
    display: 'none',
    "z-index": 1001
  }).forEach(([key, value]) => { settingsEl.style.setProperty(key, value); });

  const settingsButtonEl = document.createElement('button')
  Object.entries({
    padding: 0,
    "line-height": 0,
    border: 'none'
  }).forEach(([key, value]) => { settingsButtonEl.style.setProperty(key, value); });
  const settingsIcoEl = document.createElement('img')
  settingsIcoEl.src = "data:image/png;base64, iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAADsAAAA7AF5KHG9AAAAGXRFWHRTb2Z0d2FyZQB3d3cuaW5rc2NhcGUub3Jnm+48GgAAA5pJREFUWIXFl1toVEcYx38zuzWx2iahTWzxQjbNbaP0TUnSgLcHrakNmArFCPahEMEQBB/EJxX6YqG1rNISpDeoiWC1UBrZF21FMZg+CG3MJtXuamrBJBWzXura7jnjw5gmu2fO2XOkrT/Yh/2+b77//zAz58wIDNQeUvWWokPAemAxUAEIU60HCpgQMGYr4mHF0dGdYjS/KKdpVY8qkRk+QPAOEAooWAgL+BzYdbVb3HEYqD+oKrMh+oGGf1k4n8uWpDXVJa7/Y6DugHrOmssFYNl/LD7NiF1EY7JTpMMAVjEHg4i/PB9eWwJhqf9nbTg/Bjfv+TZQH/qL94FOUXtI1duKIXzO+TMhOLsNyuflxifuw8ovtBmfZG3JUqlgq19xgIpnneIAFfNggSHuQVjadEilWBdomNdmDLpRYb0EKk2ZkIB9q6CvHdrqdO9IGexpce+2pwUipbq2rU6P3btS93KhUlTHlAXI/MzWV/XgaRKT2kBx2PuRMllI3YZo+Uxs/1n46idjuS1N4iVF0L0iNxYtLywOuma2OMDORigtNpZLhzhA1woom1tYzC8lRbBjuTlnfKbmxd4NbQXHh+FMSs/3mghsXuq9BhsXBTDw6SV4b7Xe8ybx7d/B99dmYqdT+vdJK0iDi78t+OyS2YBxCk4moLUXBm44c8eHc8WnOZOCEwlnfOCG7vXNSAADAKkpOHXFLOTG6aQzduqK7uWGq4EnQQR/EbkbiJTChhpnfG3EvZkpt6FG9wpkoD0K/VugybBy32rQq94k3m44STQt0r02Rc0GRHVMqfxg/xaofcHdtQK+Hp5ZD2si2pjXDIz8ARv7nHHjNrzwm7cBAWxu0D+/mHYUuEzB4UG4/cB/80KkM/Dxj+4GHEeI9EOIDebGEpP6Q1OITFbXzuajizCVMZbbYeAWUJ6f6fsZqsog+iIcG4JvR6GyFHY1w7pXzOLxq/DhAFybgjfr4O1lMDype7kwIWpialCBy6fCycLn4Ydt5tyqL+H3O+acEcFFaSviAYboLfAkORM2cRlWHEVfGnwx8ac+gOYzfg/GDXEPsnaIXgFQHVNHgHf9jnxpPrTkHcvPjWkTflHQ82u32P50LiaChD2HpmSnSEuA0d3iriV5A7j8P8gPWYLXk50iDbNeRI/vas3AEcDHjg9MVkFP6AHN0/dCcHl9Vx1WtdKmA309XwIscKv1QAHjCK5jE7dD9Ca7xC/5RY8AObgVwJWKub0AAAAASUVORK5CYII="
  settingsIcoEl.alt = "settings"
  settingsButtonEl.append(settingsIcoEl)
  
  settingsButtonEl.addEventListener('click', () => {
    settingsButtonHandler(settingsEl, settingsButtonEl)
  })

  shortcutsEl.append(toggleEl, settingsButtonEl)
  hudEl.append(infosEl)

  document.body.append(shortcutsEl, hudEl, settingsEl)
  updateButtonAndStorage()
}

function main () {
  // just return if it is an Iframe
  if (window.top !== window.self)
    return
  initHud()
  initSettings()
  window.addEventListener('storage', function(event) {
    if (event.oldValue == event.newValue)
      return
    if (event.key == 'pouletToggleState')
      buttonClickListener()
    if (event.key == 'pouletSettings') {
      newSettings = JSON.parse(event.newValue)
      changedSettings = [...(new Set([...Object.keys(settings), ...Object.keys(newSettings)]))]
        .reduce((acc, el) => {
          if (newSettings[el] != settings[el])
            acc[el] = newSettings[el]
          return acc
        },{})
      console.log("updated storage, changed settings :", changedSettings)
      settingsChangedHandler(changedSettings)
    }
  })
  setPouletListeners(window.location.href)
  setPushStateListener()
  window.onpopstate = function(event) {
    setPouletListeners(window.location.href)
  }
}

document.addEventListener("DOMContentLoaded", main)
