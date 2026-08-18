'use client';

/**
 * InteractiveChart — TradingView lightweight-charts candlestick + volume.
 *
 * Fetches OHLCV JSON from the backend (Redis-cached) and renders an
 * interactive chart: zoom (wheel), pan (drag), crosshair with OHLC readout.
 * Horizontal price lines mark trade levels (breakout / SL / T1 / T2 / entry).
 */
import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType, LineStyle } from 'lightweight-charts';
import { api, OhlcvBar } from '@/lib/api';

export interface PriceLevel {
  price: number | null | undefined;
  label: string;
  color: string;           // hex
  style?: 'solid' | 'dashed';
}

interface Props {
  symbol: string;
  timeframe: string;       // daily | weekly | monthly
  levels?: PriceLevel[];
  height?: number;
}

export function InteractiveChart({ symbol, timeframe, levels = [], height = 420 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [legend, setLegend] = useState<string>('');

  // Create chart once per mount
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#6b7280',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(107,114,128,0.08)' },
        horzLines: { color: 'rgba(107,114,128,0.08)' },
      },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: 'rgba(107,114,128,0.2)' },
      timeScale: { borderColor: 'rgba(107,114,128,0.2)', timeVisible: false },
      autoSize: true,
    });

    const candles = chart.addCandlestickSeries({
      upColor: '#16a34a', downColor: '#dc2626',
      borderUpColor: '#16a34a', borderDownColor: '#dc2626',
      wickUpColor: '#16a34a', wickDownColor: '#dc2626',
    });

    const volume = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    candleRef.current = candles;
    (chart as any).__volumeSeries = volume;

    // Crosshair legend (OHLC readout)
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !candleRef.current) { setLegend(''); return; }
      const d = param.seriesData.get(candleRef.current) as any;
      if (!d) { setLegend(''); return; }
      setLegend(`O ${d.open?.toFixed(2)}  H ${d.high?.toFixed(2)}  L ${d.low?.toFixed(2)}  C ${d.close?.toFixed(2)}`);
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  // Load data when symbol/timeframe changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api.getOhlcv(symbol, timeframe)
      .then((res) => {
        if (cancelled || !chartRef.current || !candleRef.current) return;
        const bars: OhlcvBar[] = res.bars || [];
        if (bars.length === 0) { setError('No price data available'); return; }

        candleRef.current.setData(
          bars.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }))
        );

        const volSeries = (chartRef.current as any).__volumeSeries as ISeriesApi<'Histogram'>;
        if (volSeries) {
          volSeries.setData(
            bars.map(b => ({
              time: b.time,
              value: b.volume,
              color: b.close >= b.open ? 'rgba(22,163,74,0.35)' : 'rgba(220,38,38,0.35)',
            }))
          );
        }

        // Price level lines
        // Clear old lines by re-creating them on the series (setData resets markers, not price lines,
        // so track and remove explicitly)
        const series = candleRef.current as any;
        if (series.__priceLines) {
          series.__priceLines.forEach((pl: any) => candleRef.current!.removePriceLine(pl));
        }
        series.__priceLines = [];
        levels.forEach((lvl) => {
          if (lvl.price === null || lvl.price === undefined || isNaN(lvl.price)) return;
          const line = candleRef.current!.createPriceLine({
            price: lvl.price,
            color: lvl.color,
            lineWidth: 1,
            lineStyle: lvl.style === 'dashed' ? LineStyle.Dashed : LineStyle.Solid,
            axisLabelVisible: true,
            title: lvl.label,
          });
          series.__priceLines.push(line);
        });

        chartRef.current.timeScale().fitContent();
      })
      .catch((e) => { if (!cancelled) setError(e.message || 'Failed to load chart data'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe, JSON.stringify(levels.map(l => l.price))]);

  return (
    <div className="relative">
      {legend && (
        <div className="absolute top-2 left-2 z-10 text-xs font-mono text-text-secondary bg-bg-card/80 backdrop-blur px-2 py-1 rounded border border-border">
          {legend}
        </div>
      )}
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-card/50">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      )}
      {error && !loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <p className="text-sm text-text-tertiary">{error}</p>
        </div>
      )}
      <div ref={containerRef} style={{ height }} className="w-full" />
    </div>
  );
}
