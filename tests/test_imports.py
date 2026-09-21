def test_project_imports():
    import app
    import app.ai.schemas
    import app.config.settings
    assert app is not None
