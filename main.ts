enum SwipeDirection {
    //% block="→ 右"
    E = 0,
    //% block="↗ 右上"
    NE = 1,
    //% block="↑ 上"
    N = 2,
    //% block="↖ 左上"
    NW = 3,
    //% block="← 左"
    W = 4,
    //% block="↙ 左下"
    SW = 5,
    //% block="↓ 下"
    S = 6,
    //% block="↘ 右下"
    SE = 7
}

/**
 * micro:bit v2 のLEDを光センサーにして、上でなぞった方向を8方位で検知する
 * (実機のv2専用。シミュレーターでは動きません)
 */
//% weight=100 color=#2E86DE icon="\uf0a6" block="スワイプ"
namespace swipe {
    let baseX = [1, 1, 1, 1, 1]
    let baseY = [1, 1, 1, 1, 1]
    let rawX = [0, 0, 0, 0, 0]
    let rawY = [0, 0, 0, 0, 0]

    let sensitivity = 3     // 1(鈍い)〜10(敏感)
    let deadband = 0.08     // 明るさのゆらぎとして無視する割合
    let minMove = 0.8       // これ未満の移動はタップ扱い(LED何個分か)
    let holdMs = 600        // 検知後、表示を安定させるため測定を止める時間
    let started = false
    let active = false
    let debug = false
    let lastSeen = 0
    let startT = 0
    let lockUntil = 0
    let lastCx = 2
    let lastCy = 2
    let last = -1
    let cxs: number[] = []
    let cys: number[] = []

    class Handler {
        dir: number
        fn: (d: SwipeDirection) => void
        constructor(dir: number, fn: (d: SwipeDirection) => void) {
            this.dir = dir
            this.fn = fn
        }
    }
    let handlers: Handler[] = []

    function fire(d: number) {
        last = d
        lockUntil = control.millis() + holdMs
        for (let h of handlers) {
            if (h.dir == -1 || h.dir == d) {
                const fn = h.fn
                control.inBackground(function () {
                    fn(d)
                })
            }
        }
    }

    function finish() {
        const n = cxs.length
        if (n < 3) return
        const k = Math.max(1, Math.min(3, Math.floor(n / 2)))
        let sx = 0, sy = 0, ex = 0, ey = 0
        for (let i = 0; i < k; i++) {
            sx += cxs[i]
            sy += cys[i]
            ex += cxs[n - 1 - i]
            ey += cys[n - 1 - i]
        }
        sx /= k; sy /= k; ex /= k; ey /= k
        const dx = ex - sx
        const dy = ey - sy
        if (Math.sqrt(dx * dx + dy * dy) < minMove) return
        // yは下向きなので反転。0°=右 90°=上
        const angle = Math.atan2(-dy, dx) * 180 / Math.PI
        const idx = ((Math.round(angle / 45) % 8) + 8) % 8
        fire(idx)
    }

    function readFrame() {
        swipeLED.scan()
        for (let i = 0; i < 5; i++) {
            rawY[i] = swipeLED.value(i)
            rawX[i] = swipeLED.value(5 + i)
        }
    }

    function tick() {
        readFrame()
        let tx = 0, ty = 0, mx = 0, my = 0
        for (let i = 0; i < 5; i++) {
            let sx = rawX[i] / baseX[i] - 1 - deadband
            let sy = rawY[i] / baseY[i] - 1 - deadband
            if (sx < 0) sx = 0
            if (sy < 0) sy = 0
            tx += sx
            ty += sy
            mx += sx * i
            my += sy * i
        }
        const total = (tx + ty) / 2
        const now = control.millis()

        if (total >= 0.9 / sensitivity) {
            if (!active) {
                active = true
                cxs = []
                cys = []
                startT = now
            }
            if (tx > 0) lastCx = mx / tx
            if (ty > 0) lastCy = my / ty
            if (cxs.length < 200) {
                cxs.push(lastCx)
                cys.push(lastCy)
            }
            lastSeen = now
        } else if (active) {
            if (now - lastSeen > 120) {
                active = false
                finish()
            }
        } else {
            // 何もないときは基準をゆっくり追従させる(部屋の明るさ変化対策)
            for (let i = 0; i < 5; i++) {
                baseX[i] = baseX[i] * 0.97 + Math.max(1, rawX[i]) * 0.03
                baseY[i] = baseY[i] * 0.97 + Math.max(1, rawY[i]) * 0.03
            }
        }
        if (active && now - startT > 2500) active = false

        if (debug) {
            serial.writeLine("X " + rawX.join(",") + " Y " + rawY.join(",") + " T " + Math.round(total * 100))
        }
    }

    function start() {
        if (started) return
        started = true
        control.inBackground(function () {
            calibrate()
            while (true) {
                if (control.millis() < lockUntil) {
                    basic.pause(20)
                } else {
                    tick()
                    basic.pause(5)
                }
            }
        })
    }

    /**
     * 今の明るさを基準にする(LEDの上に何もない状態で呼んでね)
     */
    //% blockId=swipe_calibrate block="明るさを調整する"
    //% weight=90
    export function calibrate() {
        let sumX = [0, 0, 0, 0, 0]
        let sumY = [0, 0, 0, 0, 0]
        const n = 8
        for (let f = 0; f < n; f++) {
            readFrame()
            for (let i = 0; i < 5; i++) {
                sumX[i] += rawX[i]
                sumY[i] += rawY[i]
            }
            basic.pause(10)
        }
        for (let i = 0; i < 5; i++) {
            baseX[i] = Math.max(1, sumX[i] / n)
            baseY[i] = Math.max(1, sumY[i] / n)
        }
        active = false
    }

    /**
     * なぞった方向を指定して処理を実行
     */
    //% blockId=swipe_on_dir block="なぞったとき %dir"
    //% weight=80
    export function onSwipe(dir: SwipeDirection, handler: () => void) {
        handlers.push(new Handler(dir, function (d: SwipeDirection) {
            handler()
        }))
        start()
    }

    /**
     * どの方向でも、なぞったときに方向つきで実行
     */
    //% blockId=swipe_on_any block="なぞったとき 方向 %direction"
    //% draggableParameters="reporter"
    //% weight=79
    export function onAnySwipe(handler: (direction: SwipeDirection) => void) {
        handlers.push(new Handler(-1, handler))
        start()
    }

    /**
     * 最後になぞった方向(まだなら -1)
     */
    //% blockId=swipe_last block="最後になぞった方向"
    //% weight=70
    export function lastDirection(): number {
        return last
    }

    /**
     * 方向を矢印アイコンにして返す
     */
    //% blockId=swipe_arrow block="方向 %dir を矢印にする"
    //% weight=60
    export function toArrow(dir: SwipeDirection): ArrowNames {
        switch (dir) {
            case SwipeDirection.E: return ArrowNames.East
            case SwipeDirection.NE: return ArrowNames.NorthEast
            case SwipeDirection.N: return ArrowNames.North
            case SwipeDirection.NW: return ArrowNames.NorthWest
            case SwipeDirection.W: return ArrowNames.West
            case SwipeDirection.SW: return ArrowNames.SouthWest
            case SwipeDirection.S: return ArrowNames.South
            default: return ArrowNames.SouthEast
        }
    }

    /**
     * 感度(1=鈍い 〜 10=敏感)
     */
    //% blockId=swipe_sens block="感度 %value"
    //% value.min=1 value.max=10 value.defl=3
    //% weight=50
    export function setSensitivity(value: number) {
        sensitivity = Math.max(1, Math.min(10, value))
    }

    /**
     * 検知したあと、表示を安定させるために測定を止める時間(ミリ秒)
     */
    //% blockId=swipe_hold block="検知後の待ち時間 %ms ms"
    //% ms.defl=600
    //% weight=45
    export function setHold(ms: number) {
        holdMs = Math.max(0, ms)
    }

    /**
     * 測定値をシリアルに出力する(調整用)
     */
    //% blockId=swipe_debug block="測定値をシリアルに出力 %on"
    //% on.shadow=toggleOnOff
    //% weight=40
    export function debugSerial(on: boolean) {
        debug = on
    }
}
