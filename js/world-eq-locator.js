const SVGNS = 'http://www.w3.org/2000/svg';
const DEGREE_TO_RADIAN = Math.PI / 180;
const INTENSITY_LOOKUP = ['I', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

class MapboxGLButtonControl {

    constructor(optionArray) {
        this._options = optionArray.map(options => ({
            className: options.className || '',
            title: options.title || '',
            eventHandler: options.eventHandler
        }));
    }

    onAdd(map) {
        const me = this;

        me._map = map;

        me._container = document.createElement('div');
        me._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

        me._buttons = me._options.map(options => {
            const button = document.createElement('button'),
                icon = document.createElement('span'),
                {className, title, eventHandler} = options;

            button.className = className;
            button.type = 'button';
            button.title = title;
            button.setAttribute('aria-label', title);
            button.onclick = eventHandler;

            icon.className = 'mapboxgl-ctrl-icon';
            icon.setAttribute('aria-hidden', true);
            button.appendChild(icon);

            me._container.appendChild(button);

            return button;
        });

        return me._container;
    }

    onRemove() {
        const me = this;

        me._container.parentNode.removeChild(me._container);
        me._map = undefined;
    }

}

const colorScale = d3.scaleSequential([0, -500000], d3.interpolateSpectral);

const pad = (n, size) => {
    const s = '0000' + n;
    return s.substr(s.length - size);
}
const toLocalDateString = d => {
    const year = pad(d.getFullYear(), 4);
    const month = pad(d.getMonth() + 1, 2);
    const date = pad(d.getDate(), 2);
    return `${year}-${month}-${date}`;
};
const toUTCDateString = d => {
    const year = pad(d.getUTCFullYear(), 4);
    const month = pad(d.getUTCMonth() + 1, 2);
    const date = pad(d.getUTCDate(), 2);
    return `${year}-${month}-${date}`;
};
const toLocalTimeString = d => {
    const hours = pad(d.getHours(), 2);
    const minutes = pad(d.getMinutes(), 2);
    const seconds = pad(d.getSeconds(), 2);
    return `${hours}:${minutes}:${seconds}`;
};
const toUTCTimeString = d => {
    const hours = pad(d.getUTCHours(), 2);
    const minutes = pad(d.getUTCMinutes(), 2);
    const seconds = pad(d.getUTCSeconds(), 2);
    return `${hours}:${minutes}:${seconds}`;
};
const toTimezoneOffsetString = d => {
    const offset = d.getTimezoneOffset();
    const sign = offset < 0 ? '+' : '-';
    const hours = pad(Math.floor(Math.abs(offset) / 60), 2);
    const minutes = pad(Math.abs(offset) % 60, 2);
    return `UTC${sign}${hours}:${minutes}`;
};

const options = {};
for (const key of ['id', 'lng', 'lat', 'd', 't', 'l', 'm', 's', 'g', 'static']) {
    const regex = new RegExp(`(?:\\?|&)${key}=(.*?)(?:&|$)`);
    const match = location.search.match(regex);
    options[key] = match ? decodeURIComponent(match[1]) : undefined;
}
let auto = !!(options.lng && options.lat && options.t || options.id);
const interactive = !(auto && options.static);
const getParams = options => ({
    id: options.id,
    lng: +options.lng,
    lat: +options.lat,
    depth: isNaN(options.d) ? undefined : +options.d,
    time: options.t,
    location: options.l,
    magnitude: isNaN(options.m) ? undefined : +options.m,
    mmi: isNaN(options.m) ? undefined : +options.s,
    sig: isNaN(options.g) ? undefined : +options.g
});
const initialParams = getParams(options);
const params = {};
let flying = false;

const mapElement = document.getElementById('map');

const isMobile = () => mapElement.clientWidth < 640;
const calculateCameraOptions = (depth, maxZoom) => {
    const mobile = isMobile();
    const height = mapElement.clientHeight;
    const adjustedHeight = mobile ? height - 196 : height;
    const zoom = 5.73 - Math.log2(depth) + Math.log2(adjustedHeight);
    const padding = adjustedHeight * 0.4 * Math.min(depth / adjustedHeight * Math.pow(maxZoom - 5.09, 2), 1);

    return {
        zoom: Math.min(Math.max(zoom, 0), maxZoom),
        padding: mobile ?
            {top: 196, bottom: padding, left: 0, right: 0} :
            {top: 0, bottom: padding, left: 310, right: 0}
    };
};
const {zoom, padding} = calculateCameraOptions(initialParams.depth || 0, 6);

const map = new mapboxgl.Map({
    accessToken: 'pk.eyJ1IjoibmFnaXgiLCJhIjoiY2xjcjE0aTc2MDNzNDNwbXowbnFqeTU0MSJ9.RmQbFa8dy5PKTnCiU_8cKA',
    container: 'map',
    style: 'data/style.json',
    center: interactive ? [15, 40] : [initialParams.lng, initialParams.lat],
    zoom: interactive ? 4 : zoom,
    minZoom: 2,
    pitch: interactive && auto ? 0 : 60,
    interactive
});
if (!interactive) {
    map.setPadding(padding);
}
let loaded = false;

const canvasElement = document.querySelector('#map .mapboxgl-canvas');
const recentListElement = document.querySelector('#recent-list>div:last-child');
const recentListBGElement = document.getElementById('recent-list-bg');
const infoBGElement = document.getElementById('info-bg');

if (interactive) {
    map.addControl(new mapboxgl.NavigationControl({visualizePitch: true}));
    map.addControl(new mapboxgl.FullscreenControl());
    map.addControl(new MapboxGLButtonControl([{
        className: 'mapboxgl-ctrl-recent-list',
        title: 'Recent earthquakes',
        eventHandler() {
            recentListBGElement.style.display = 'block';
        }
    }, {
        className: 'mapboxgl-ctrl-twitter',
        title: 'Twitter',
        eventHandler() {
            open('https://twitter.com/WorldEQLocator', '_blank');
        }
    }, {
        className: 'mapboxgl-ctrl-info',
        title: 'About World EQ Locator',
        eventHandler() {
            infoBGElement.style.display = 'block';
        }
    }]));

    recentListBGElement.addEventListener('click', () => {
        recentListBGElement.style.display = 'none';
        canvasElement.focus();
    });
    infoBGElement.addEventListener('click', () => {
        infoBGElement.style.display = 'none';
        canvasElement.focus();
    });
}

const svg = document.createElementNS(SVGNS, 'svg');
svg.setAttributeNS(null, 'class', 'svg');
mapElement.appendChild(svg);

const defs = document.createElementNS(SVGNS, 'defs');
defs.innerHTML =
    '<filter id="hypocenter-filter" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5" /></filter>' +
    '<filter id="epicenter-filter" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="20" /></filter>';
svg.appendChild(defs);

const wave1 = document.createElementNS(SVGNS, 'circle');
wave1.setAttributeNS(null, 'class', interactive ? 'wave' : 'wave-bright');
wave1.setAttributeNS(null, 'visibility', 'hidden');
svg.appendChild(wave1);

const wave2 = document.createElementNS(SVGNS, 'circle');
wave2.setAttributeNS(null, 'class', interactive ? 'wave' : 'wave-bright');
wave2.setAttributeNS(null, 'visibility', 'hidden');
svg.appendChild(wave2);

const hypocenterCircle = document.createElementNS(SVGNS, 'circle');
hypocenterCircle.setAttributeNS(null, 'class', 'hypocenter');
hypocenterCircle.setAttributeNS(null, 'r', 15);
hypocenterCircle.setAttributeNS(null, 'filter', 'url(#hypocenter-filter)');
hypocenterCircle.setAttributeNS(null, 'visibility', 'hidden');
svg.appendChild(hypocenterCircle);

const leader = document.createElementNS(SVGNS, 'line');
leader.setAttributeNS(null, 'class', 'leader');
leader.setAttributeNS(null, 'visibility', 'hidden');
svg.appendChild(leader);

const epicenterGroup = document.createElementNS(SVGNS, 'g');
svg.appendChild(epicenterGroup);

const epicenterCircle = document.createElementNS(SVGNS, 'circle');
epicenterCircle.setAttributeNS(null, 'class', 'epicenter');
epicenterCircle.setAttributeNS(null, 'r', 30);
epicenterCircle.setAttributeNS(null, 'filter', 'url(#epicenter-filter)');
epicenterCircle.setAttributeNS(null, 'visibility', 'hidden');
epicenterGroup.appendChild(epicenterCircle);

const tooltip = document.createElement('div');
Object.assign(tooltip, {
    className: 'tooltip hidden'
});
mapElement.appendChild(tooltip);

const legend = document.createElement('div');
Object.assign(legend, {
    className: 'legend-depth'
});
mapElement.appendChild(legend);

const panel = document.createElement('div');
Object.assign(panel, {
    className: interactive ? 'panel hidden' : 'panel static'
});
mapElement.appendChild(panel);

map.once('load', () => {
    loaded = true;
});

Promise.all([
    fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson').then(res => res.json()),
    fetch('data/hypocenters.json').then(res => res.json()).then(data =>
        new deck.MapboxLayer({
            id: 'hypocenters',
            type: deck.ScatterplotLayer,
            data,
            pickable: true,
            opacity: 0.2,
            radiusMinPixels: 2,
            billboard: true,
            antialiasing: false,
            getFillColor: d => {
                const [rgb, r, g, b] = colorScale(d.position[2]).match(/(\d+), (\d+), (\d+)/);
                return [+r, +g, +b];
            },
            getRadius: 500
        })
    ),
    initialParams.id ? fetch(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${initialParams.id}.geojson`).then(res => res.json()).then(data => {
        const [lng, lat, z] = data.geometry.coordinates;
        const {time, place, mag, mmi, sig} = data.properties;
        Object.assign(initialParams, {
            lng,
            lat,
            depth: isNaN(z) || z === null ? undefined : z,
            time,
            location: place,
            magnitude: isNaN(mag) || mag === null ? undefined : mag,
            mmi: isNaN(mmi) || mmi === null ? undefined : mmi,
            sig: isNaN(sig) || sig === null ? undefined : sig
        });
    }).catch(err => {
        initialParams.id = undefined;
    }) : Promise.resolve(),
    new Promise(resolve => map.once('styledata', resolve))
]).then(([quakes, hypocenterLayer]) => {
    map.addLayer(hypocenterLayer, 'waterway');

    // Workaround for deck.gl #3522
    map.__deck.props.getCursor = () => map.getCanvas().style.cursor;

    if (recentListElement) {
        for (const quake of quakes.features) {
            const options = {};
            const [lng, lat, z] = quake.geometry.coordinates;
            const {time, place, mag, mmi, sig} = quake.properties;
            options.id = quake.id;
            options.lng = lng;
            options.lat = lat;
            options.d = z === null ? undefined : z;
            options.l = place;
            options.t = time;
            options.m = mag === null ? undefined : mag;
            options.s = mmi === null ? undefined : mmi;
            options.g = sig === null ? undefined : sig;

            const dateString = toLocalDateString(new Date(options.t));
            const timeString = toLocalTimeString(new Date(options.t));
            const timezoneOffsetString = toTimezoneOffsetString(new Date(options.t));
            const magnitudeString = isNaN(options.m) || options.m === null ? '' : 'M' + options.m.toFixed(1) + ' - ';

            const listItem = document.createElement('div');
            Object.assign(listItem, {
                id: quake.id,
                className: quake.id === initialParams.id ? 'menu-item active' : 'menu-item',
                innerHTML: `<div class="menu-check"></div><div class="menu-text">${dateString} ${timeString} (${timezoneOffsetString})<br><span class="significance-label-${options.g >= 600 ? 2 : options.g >= 400 ? 1 : 0}">${magnitudeString}${options.l}</span></div>`
            });
            listItem.addEventListener('click', () => {
                const activeListItem = mapElement.querySelector('.menu-item.active');
                if (activeListItem) {
                    if (activeListItem === listItem) {
                        return;
                    }
                    activeListItem.classList.remove('active');
                }
                listItem.classList.add('active');
                history.pushState({}, '', location.href.replace(/\?.*/, '') + `?id=${options.id}`);
                setHypocenter(getParams(options));
            });
            recentListElement.appendChild(listItem);
        }
    }

    const updateMarker = info => {
        const viewport = map.__deck.getViewports()[0];
        const hLng = auto ? params.lng : info.object.position[0];
        const cLng = map.getCenter().lng;
        const diff1 = (hLng - cLng + 540) % 360 - 180;
        const diff2 = Math.sign(hLng) - Math.sign(cLng);
        const offset = diff1 * diff2 < 0 ? Math.sign(diff1) * 360 : 0;
        const [ex, ey] = auto ?
            viewport.project([params.lng + offset, params.lat]) :
            info.viewport.project([info.object.position[0] + offset, info.object.position[1]]);
        const [hx, hy] = auto ?
            viewport.project([params.lng + offset, params.lat, -(params.depth || 0) * 1000]) :
            [info.x, info.y];
        const depth = auto ? -(params.depth || 0) * 1000 : info.object.position[2];

        wave1.setAttributeNS(null, 'cx', hx);
        wave1.setAttributeNS(null, 'cy', hy);
        wave1.setAttributeNS(null, 'visibility', 'visible');

        wave2.setAttributeNS(null, 'cx', hx);
        wave2.setAttributeNS(null, 'cy', hy);
        wave2.setAttributeNS(null, 'visibility', 'visible');

        hypocenterCircle.setAttributeNS(null, 'cx', hx);
        hypocenterCircle.setAttributeNS(null, 'cy', hy);
        hypocenterCircle.setAttributeNS(null, 'fill', colorScale(depth));
        hypocenterCircle.setAttributeNS(null, 'visibility', 'visible');

        leader.setAttributeNS(null, 'x1', hx);
        leader.setAttributeNS(null, 'y1', hy);
        leader.setAttributeNS(null, 'x2', ex);
        leader.setAttributeNS(null, 'y2', ey);
        leader.setAttributeNS(null, 'visibility', 'visible');

        epicenterGroup.style.transform = `translate(${ex}px, ${ey}px)`;
        epicenterCircle.style.transform = `scale(1, ${Math.cos(map.getPitch() * DEGREE_TO_RADIAN)})`;
        epicenterCircle.setAttributeNS(null, 'visibility', 'visible');

        if (!auto) {
            tooltip.style.left = info.x + 4 + 'px';
            tooltip.style.top = info.y + 4 + 'px';
            tooltip.innerHTML = (-depth / 1000).toFixed(2) + 'km';
            tooltip.classList.remove('hidden');
        }
    };

    const hideMarker = () => {
        wave1.setAttributeNS(null, 'visibility', 'hidden');
        wave2.setAttributeNS(null, 'visibility', 'hidden');
        hypocenterCircle.setAttributeNS(null, 'visibility', 'hidden');
        leader.setAttributeNS(null, 'visibility', 'hidden');
        epicenterCircle.setAttributeNS(null, 'visibility', 'hidden');
        tooltip.classList.add('hidden');
    };

    const updateWave = now => {
        wave1.setAttributeNS(null, 'r', now / 10 % 300);
        wave1.setAttributeNS(null, 'opacity', 1 - now / 3000 % 1);
        wave2.setAttributeNS(null, 'r', (now / 10 + 150) % 300);
        wave2.setAttributeNS(null, 'opacity', 1 - (now / 3000 + 0.5) % 1);
    };

    const onHover = info => {
        if (info.layer && info.layer.id === 'hypocenters') {
            if (info.object) {
                updateMarker(info);
            } else {
                hideMarker();
            }
            return true;
        }
    };

    const setFinalView = () => {
        const toDateString = interactive ? toLocalDateString : toUTCDateString;
        const toTimeString = interactive ? toLocalTimeString : toUTCTimeString;
        const dateString = toDateString(new Date(params.time));
        const timeString = toTimeString(new Date(params.time));
        const timezoneOffsetString = interactive ? toTimezoneOffsetString(new Date(params.time)) : 'UTC';
        const depthString = isNaN(params.depth) ? 'Unknown' : `${params.depth.toFixed(1)}km`;
        const intensityString = isNaN(params.mmi) ? '-' : INTENSITY_LOOKUP[Math.round(params.mmi)];
        const magnitudeString = isNaN(params.magnitude) ? 'Unknown' : params.magnitude.toFixed(1);

        panel.innerHTML =
            '<div class="panel-body">' +
            '<div class="panel-column">' +
            '<div class="panel-section">' +
            '<div class="panel-section-title">Time</div>' +
            '<div class="panel-section-body">' +
            `<div class="panel-date-text">${dateString}</div>` +
            `<div class="panel-time-text">${timeString}</div>` +
            `<div class="panel-date-text">${timezoneOffsetString}</div>` +
            '</div>' +
            '</div>' +
            '<div class="panel-section">' +
            '<div class="panel-section-title">Location</div>' +
            '<div class="panel-section-body">' +
            `<div class="panel-location-text">${params.location}</div>` +
            '</div>' +
            '</div>' +
            '</div>' +
            '<div class="panel-column">' +
            '<div class="panel-section">' +
            '<div class="panel-section-title">Depth</div>' +
            `<div class="panel-section-body">${depthString}</div>` +
            '</div>' +
            '<div class="panel-section">' +
            '<div class="panel-section-title">MMI</div>' +
            `<div class="panel-section-body">${intensityString}</div>` +
            '</div>' +
            '<div class="panel-section">' +
            '<div class="panel-section-title">Magnitude</div>' +
            `<div class="panel-section-body">${magnitudeString}</div>` +
            '</div>' +
            '</div>' +
            '</div>';

        if (interactive) {
            const closeButton = document.createElement('div');
            Object.assign(closeButton, {
                className: 'close-button'
            });
            closeButton.addEventListener('click', () => {
                const activeListItem = mapElement.querySelector('.menu-item.active');
                if (activeListItem) {
                    activeListItem.classList.remove('active');
                }
                setHypocenter();
                canvasElement.focus();
            });
            panel.appendChild(closeButton);
        }

        flying = false;
        panel.classList.remove('hidden');

        if (interactive) {
            const {zoom, padding} = calculateCameraOptions(params.depth || 0, 7);
            map.easeTo({pitch: 60, zoom, padding, duration: 2000});
        }
    };

    const setHypocenter = _params => {
        if (interactive) {
            hideMarker();
            panel.classList.add('hidden');
            map.off('moveend', setFinalView);
        }
        auto = !!(_params && _params.lng && _params.lat && _params.time);
        if (!auto) {
            map.easeTo({
                padding: {top: 0, bottom: 0, left: 0, right: 0},
                duration: 1000
            });
            hypocenterLayer.setProps({onHover});
            return;
        }
        Object.assign(params, _params);

        if (interactive) {
            hypocenterLayer.setProps({onHover: null});
            map.flyTo({
                center: [params.lng, params.lat],
                pitch: 0,
                zoom: 6,
                padding: {top: 0, bottom: 0, left: 0, right: 0},
                curve: 1,
                speed: 0.5
            });
            flying = true;
            map.once('moveend', setFinalView);
        } else {
            setFinalView();
            updateMarker();
            updateWave(750);
        }
    };

    let mobile = isMobile();
    if (interactive) {
        const repeat = now => {
            updateWave(now);
            requestAnimationFrame(repeat);
        };
        requestAnimationFrame(repeat);

        map.on('move', () => {
            if (!auto) {
                hideMarker();
            } else if (!flying) {
                updateMarker();
            }
        });

        map.on('resize', () => {
            if (!auto) {
                hideMarker();
            } else if (!flying && mobile !== isMobile()) {
                const {zoom, padding} = calculateCameraOptions(params.depth || 0, 8);
                map.easeTo({zoom, padding, duration: 1000});
                mobile = !mobile;
            }
        });
    } else {
        map.on('resize', () => {
            if (mobile !== isMobile()) {
                map.jumpTo(calculateCameraOptions(params.depth || 0, 6));
                mobile = !mobile;
            }
            updateMarker();
        });
    }

    if (!auto) {
        hypocenterLayer.setProps({onHover});
    } else {
        map.once(loaded ? 'idle' : 'load', () => {
            setHypocenter(initialParams);
            if (!interactive) {
                const completed = document.createElement('div');
                completed.id = 'completed';
                document.body.appendChild(completed);
            }
        });
    }
});
