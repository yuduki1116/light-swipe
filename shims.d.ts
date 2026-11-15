// Auto-generated. Do not edit.
declare namespace swipeLED {

    /**
     * LEDマトリクスを一瞬止めて、行5本+列5本の光量を測る
     */
    //% shim=swipeLED::scan
    function scan(): void;

    /**
     * 0-4=行(y)、5-9=列(x) の測定値(大きいほど暗い)
     */
    //% shim=swipeLED::value
    function value(index: int32): int32;
}

// Auto-generated. Do not edit. Really.
