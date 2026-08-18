"""Test OHLCV chart endpoints: auth required, response shape, cache (mock yfinance)."""
import json
import pytest
from unittest.mock import patch, MagicMock
import pandas as pd
import numpy as np


def _mock_yfinance_history():
    """Create a mock DataFrame that looks like yfinance output."""
    dates = pd.date_range("2024-01-01", periods=10, freq="D")
    return pd.DataFrame({
        "Open": [100.0 + i for i in range(10)],
        "High": [105.0 + i for i in range(10)],
        "Low": [95.0 + i for i in range(10)],
        "Close": [102.0 + i for i in range(10)],
        "Volume": [1000000 + i * 10000 for i in range(10)],
    }, index=dates)


class TestOhlcvAuth:
    def test_ohlcv_without_token(self, client):
        """OHLCV endpoint requires authentication."""
        r = client.get("/api/charts/RELIANCE/ohlcv?timeframe=daily")
        assert r.status_code == 401

    def test_ohlcv_with_invalid_token(self, client):
        r = client.get("/api/charts/RELIANCE/ohlcv?timeframe=daily",
                       headers={"Authorization": "Bearer invalidtoken"})
        assert r.status_code == 401


class TestOhlcvResponse:
    def test_ohlcv_response_shape(self, client, user_token, auth_headers):
        """OHLCV response has correct shape: {symbol, timeframe, period, bars}."""
        with patch("yfinance.Ticker") as mock_ticker:
            mock_instance = MagicMock()
            mock_instance.history.return_value = _mock_yfinance_history()
            mock_ticker.return_value = mock_instance

            r = client.get("/api/charts/RELIANCE/ohlcv?timeframe=daily",
                           headers=auth_headers(user_token))
            assert r.status_code == 200
            data = r.json()
            assert "symbol" in data
            assert "timeframe" in data
            assert "period" in data
            assert "bars" in data
            assert isinstance(data["bars"], list)

    def test_ohlcv_bar_shape(self, client, user_token, auth_headers):
        """Each bar has time, open, high, low, close, volume."""
        with patch("yfinance.Ticker") as mock_ticker:
            mock_instance = MagicMock()
            mock_instance.history.return_value = _mock_yfinance_history()
            mock_ticker.return_value = mock_instance

            r = client.get("/api/charts/RELIANCE/ohlcv?timeframe=daily",
                           headers=auth_headers(user_token))
            data = r.json()
            assert len(data["bars"]) > 0
            bar = data["bars"][0]
            assert "time" in bar
            assert "open" in bar
            assert "high" in bar
            assert "low" in bar
            assert "close" in bar
            assert "volume" in bar

    def test_ohlcv_symbol_normalized(self, client, user_token, auth_headers):
        """Symbol with .NS suffix is normalized in response."""
        with patch("yfinance.Ticker") as mock_ticker:
            mock_instance = MagicMock()
            mock_instance.history.return_value = _mock_yfinance_history()
            mock_ticker.return_value = mock_instance

            r = client.get("/api/charts/RELIANCE.NS/ohlcv?timeframe=daily",
                           headers=auth_headers(user_token))
            assert r.status_code == 200
            assert r.json()["symbol"] == "RELIANCE"

    def test_ohlcv_daily_period(self, client, user_token, auth_headers):
        """Daily timeframe uses 1y period."""
        with patch("yfinance.Ticker") as mock_ticker:
            mock_instance = MagicMock()
            mock_instance.history.return_value = _mock_yfinance_history()
            mock_ticker.return_value = mock_instance

            r = client.get("/api/charts/RELIANCE/ohlcv?timeframe=daily",
                           headers=auth_headers(user_token))
            assert r.status_code == 200
            assert r.json()["period"] == "1y"

    def test_ohlcv_weekly_period(self, client, user_token, auth_headers):
        """Weekly timeframe uses 5y period."""
        with patch("yfinance.Ticker") as mock_ticker:
            mock_instance = MagicMock()
            mock_instance.history.return_value = _mock_yfinance_history()
            mock_ticker.return_value = mock_instance

            r = client.get("/api/charts/RELIANCE/ohlcv?timeframe=weekly",
                           headers=auth_headers(user_token))
            assert r.status_code == 200
            assert r.json()["period"] == "5y"

    def test_ohlcv_monthly_period(self, client, user_token, auth_headers):
        """Monthly timeframe uses 10y period."""
        with patch("yfinance.Ticker") as mock_ticker:
            mock_instance = MagicMock()
            mock_instance.history.return_value = _mock_yfinance_history()
            mock_ticker.return_value = mock_instance

            r = client.get("/api/charts/RELIANCE/ohlcv?timeframe=monthly",
                           headers=auth_headers(user_token))
            assert r.status_code == 200
            assert r.json()["period"] == "10y"

    def test_ohlcv_invalid_timeframe(self, client, user_token, auth_headers):
        """Invalid timeframe → 422."""
        r = client.get("/api/charts/RELIANCE/ohlcv?timeframe=hourly",
                       headers=auth_headers(user_token))
        assert r.status_code == 422

    def test_ohlcv_invalid_symbol(self, client, user_token, auth_headers):
        """Invalid symbol characters → 400."""
        r = client.get("/api/charts/INVALID@@@/ohlcv?timeframe=daily",
                       headers=auth_headers(user_token))
        assert r.status_code == 400

    def test_ohlcv_no_data_404(self, client, user_token, auth_headers):
        """yfinance returns empty DataFrame → 404."""
        with patch("yfinance.Ticker") as mock_ticker:
            mock_instance = MagicMock()
            mock_instance.history.return_value = pd.DataFrame()
            mock_ticker.return_value = mock_instance

            r = client.get("/api/charts/FAKE/ohlcv?timeframe=daily",
                           headers=auth_headers(user_token))
            assert r.status_code == 404

    def test_ohlcv_yfinance_error_502(self, client, user_token, auth_headers):
        """yfinance raises exception → 502."""
        with patch("yfinance.Ticker") as mock_ticker:
            mock_instance = MagicMock()
            mock_instance.history.side_effect = Exception("Network error")
            mock_ticker.return_value = mock_instance

            r = client.get("/api/charts/RELIANCE/ohlcv?timeframe=daily",
                           headers=auth_headers(user_token))
            assert r.status_code == 502


class TestOhlcvCache:
    def test_cache_stores_and_retrieves(self, client, user_token, auth_headers):
        """Second call should return cached data (yfinance not called twice)."""
        with patch("yfinance.Ticker") as mock_ticker:
            mock_instance = MagicMock()
            mock_instance.history.return_value = _mock_yfinance_history()
            mock_ticker.return_value = mock_instance

            # First call — fetches from yfinance
            r1 = client.get("/api/charts/RELIANCE/ohlcv?timeframe=daily",
                            headers=auth_headers(user_token))
            assert r1.status_code == 200
            assert mock_instance.history.call_count == 1

            # Second call — should use cache (history not called again)
            r2 = client.get("/api/charts/RELIANCE/ohlcv?timeframe=daily",
                            headers=auth_headers(user_token))
            assert r2.status_code == 200
            # history should still only be called once (cached on second)
            assert mock_instance.history.call_count == 1

            # Data should match
            assert r1.json() == r2.json()
