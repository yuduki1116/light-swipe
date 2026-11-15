#include "pxt.h"

#if MICROBIT_CODAL
#include "nrf.h"
#endif

namespace swipeLED {

#if MICROBIT_CODAL

    // micro:bit v2 のLEDピン配置
    // ピクセル(x,y) = 列ピンx(COL) と 行ピンy(ROW) の交点
    // 行=アノード / 列=カソード
    static const uint8_t ROW[5] = { 21, 22, 15, 24, 19 };   // ROW1-5 (すべてP0)
    static const uint8_t COL[5] = { 28, 11, 31, 5, 30 };    // COL1-5 (COL4だけP1_05)

    static const uint32_t CFG_IN  = 0;   // 入力・プルなし
    static const uint32_t CFG_OUT = 3;   // 出力(入力バッファ切断)

    #define SWIPE_TIMEOUT_US 12000

    static int vals[10];

    static inline NRF_GPIO_Type *colPort(int c) {
#ifdef NRF_P1
        return (c == 3) ? NRF_P1 : NRF_P0;
#else
        return NRF_P0;
#endif
    }

    static void settle() {
        for (volatile int w = 0; w < 400; w++) { }
    }

    //%
    void scan() {
        // 表示を一瞬止める(ピンの制御を借りる)
        uBit.display.disable();

        uint32_t rowMask = 0;
        for (int r = 0; r < 5; r++) rowMask |= (1u << ROW[r]);

        // ---- パス1: 行を測る ----
        // 全列をHigh(逆バイアス)、全行をLowで放電 → 行を浮かせて、立ち上がる時間を測る
        for (int c = 0; c < 5; c++) {
            colPort(c)->OUTSET = (1u << COL[c]);
            colPort(c)->PIN_CNF[COL[c]] = CFG_OUT;
        }
        NRF_P0->OUTCLR = rowMask;
        for (int r = 0; r < 5; r++) NRF_P0->PIN_CNF[ROW[r]] = CFG_OUT;
        settle();
        for (int r = 0; r < 5; r++) NRF_P0->PIN_CNF[ROW[r]] = CFG_IN;
        {
            uint32_t done = 0;
            int i = 0;
            uint64_t t0 = system_timer_current_time_us();
            while (done != rowMask) {
                i++;
                uint32_t hit = NRF_P0->IN & rowMask & ~done;
                if (hit) {
                    for (int r = 0; r < 5; r++)
                        if (hit & (1u << ROW[r])) vals[r] = i;
                    done |= hit;
                }
                if ((i & 0xFF) == 0 && (system_timer_current_time_us() - t0) > SWIPE_TIMEOUT_US) break;
            }
            for (int r = 0; r < 5; r++)
                if (!(done & (1u << ROW[r]))) vals[r] = i;
        }

        // ---- パス2: 列を測る ----
        // 全行をLow出力、全列をHighで充電 → 列を浮かせて、下がっていく時間を測る
        NRF_P0->OUTCLR = rowMask;
        for (int r = 0; r < 5; r++) NRF_P0->PIN_CNF[ROW[r]] = CFG_OUT;
        for (int c = 0; c < 5; c++) {
            colPort(c)->OUTSET = (1u << COL[c]);
            colPort(c)->PIN_CNF[COL[c]] = CFG_OUT;
        }
        settle();
        for (int c = 0; c < 5; c++) colPort(c)->PIN_CNF[COL[c]] = CFG_IN;
        {
            bool d[5] = { false, false, false, false, false };
            int remaining = 5;
            int i = 0;
            uint64_t t0 = system_timer_current_time_us();
            while (remaining > 0) {
                i++;
                for (int c = 0; c < 5; c++) {
                    if (!d[c] && !(colPort(c)->IN & (1u << COL[c]))) {
                        d[c] = true;
                        vals[5 + c] = i;
                        remaining--;
                    }
                }
                if ((i & 0xFF) == 0 && (system_timer_current_time_us() - t0) > SWIPE_TIMEOUT_US) break;
            }
            for (int c = 0; c < 5; c++)
                if (!d[c]) vals[5 + c] = i;
        }

        // 後片付け: 全ピンを入力・プルなしに戻してから表示を再開
        for (int r = 0; r < 5; r++) NRF_P0->PIN_CNF[ROW[r]] = CFG_IN;
        for (int c = 0; c < 5; c++) colPort(c)->PIN_CNF[COL[c]] = CFG_IN;
        uBit.display.enable();
    }

    //%
    int value(int index) {
        if (index < 0 || index > 9) return 0;
        return vals[index];
    }

#else
    // v1 は非対応(何もしない)
    //%
    void scan() { }

    //%
    int value(int index) { return 0; }
#endif
}
