

from urllib.parse import urlparse

def get_risk_level(score=0, severity="low"):
    if severity and severity.lower() == "high":
        return "high"
    if score >= 70:
        return "high"
    if (severity and severity.lower() == "medium") or (score >= 40):
        return "medium"
    return "low"

def extract_domain(url):
    if not url: return None
    if not url.startswith("http"):
        url = "http://" + url
    return urlparse(url).netloc

def build_attack_surface_graph(task_doc, js_files, leaks):
    """
    Converts scan results into D3-compatible JSON format.
    
    Nodes structure:
    { "id": "unique_id", "label": "display_name", "type": "node_type", "risk_level": "low/medium/high", "val": size }
    
    Links structure:
    { "source": "id1", "target": "id2", "type": "hierarchy" }
    """
    
    nodes = []
    links = []
    node_ids = set()

    def add_node(n_id, label, n_type, risk="low", size=5, meta=None):
        if n_id not in node_ids:
            nodes.append({
                "id": n_id,
                "label": label,
                "type": n_type,
                "risk_level": risk,
                "val": size,
                "meta": meta or {}
            })
            node_ids.add(n_id)

    def add_link(src, tgt):
        if src in node_ids and tgt in node_ids:
            # Avoid duplicate links if possible, D3 handles them but clean is better
            links.append({"source": src, "target": tgt})

    # 1. Root Domain Node
    target_url = task_doc.get("url", "unknown-target")
    root_domain = extract_domain(target_url) or target_url
    
    # overall risk
    risk_results = task_doc.get("results", {}).get("risk_ml", {})
    overall_score = risk_results.get("score", 0)
    overall_risk = get_risk_level(score=overall_score)
    
    add_node(root_domain, root_domain, "domain", overall_risk, 20, {"score": overall_score})

    # 2. Subdomains (Inferred from JS files and Leaks)
    # We group items by subdomain
    subdomain_map = {} # subdomain -> list of children ids

    # Helper to register subdomain
    def get_or_create_subdomain_node(url):
        if not url: return root_domain
        dom = extract_domain(url)
        if not dom: return root_domain
        
        # Check if it is the root or a subdomain
        if dom == root_domain:
            return root_domain
            
        if dom not in node_ids:
            add_node(dom, dom, "subdomain", "low", 10)
            add_link(root_domain, dom)
        
        return dom

    # 3. JS Files
    # js_files is a list of dicts from DB
    for js in js_files:
        js_id = str(js.get("_id"))
        full_url = js.get("src") or js.get("url") or "inline"
        label = full_url.split("/")[-1] if "/" in full_url else "inline.js"
        if len(label) > 20: label = label[:17] + "..."
        
        # Parent subdomain
        parent_node = get_or_create_subdomain_node(full_url if full_url != "inline" else target_url)
        
        add_node(js_id, label, "js_file", "low", 5, {"url": full_url})
        add_link(parent_node, js_id)

    # 4. Endpoints
    # endpoints stored in task results
    endpoints = task_doc.get("results", {}).get("endpoints", [])
    # Limit endpoints to avoid clutter (e.g. 50 max)
    for i, ep in enumerate(endpoints[:50]):
        ep_link = ep.get("link", "")
        if not ep_link: continue
        
        ep_id = f"ep_{i}"
        label = ep_link[:20] + "..." if len(ep_link) > 20 else ep_link
        
        # Attach to root or relevant subdomain if absolute url
        parent_node = root_domain
        if ep_link.startswith("http"):
            parent_node = get_or_create_subdomain_node(ep_link)
        
        add_node(ep_id, label, "endpoint", "low", 3, {"full_link": ep_link})
        add_link(parent_node, ep_id)

    # 5. Leaks
    for leak in leaks:
        l_id = str(leak.get("_id"))
        cat = leak.get("category", "Secret").lower() # Normalize for checking
        display_cat = leak.get("category", "Secret")
        sev = leak.get("severity", "low")
        risk = get_risk_level(severity=sev)
        
        # Determine Node Type
        node_type = "credential_leak" # default
        
        if cat in ["info", "information", "uri", "url"]:
            node_type = "info_leak"
        elif "email" in cat:
            node_type = "email_address"
        elif "endpoint" in cat or "path" in cat:
            node_type = "endpoint"
        
        # Parent JS file?
        js_ref = leak.get("jsfile_id")
        parent_node = root_domain
        
        # If we have the JS file node, link to it
        if js_ref and str(js_ref) in node_ids:
            parent_node = str(js_ref)
        else:
            # Fallback to domain
            src_file = leak.get("source_file")
            if src_file:
                parent_node = get_or_create_subdomain_node(src_file)

        add_node(l_id, display_cat, node_type, risk, 8, {
            "match": leak.get("match"),
            "severity": sev
        })
        add_link(parent_node, l_id)

    # 6. Sensitive Files & Admin Paths
    # (Implied by leak categories for now)

    # 7. Cloud/CDN Infrastructure (Derived from Leaks Metadata)
    detected_infra = set()
    
    for leak in leaks:
        # Check 'osint' metadata
        osint = leak.get("osint", {})
        meta = osint.get("metadata", {})
        
        # Cloud Provider
        cp = meta.get("cloud_provider")
        if cp:
            for p in cp.split(", "):
                detected_infra.add((p, "cloud_provider"))
        
        # Platform hints from URL (e.g. github.com, pastebin)
        url = leak.get("url", "")
        if "github.com" in url:
            detected_infra.add(("GitHub", "repository"))
        elif "gitlab.com" in url:
            detected_infra.add(("GitLab", "repository"))
        elif "herokuapp.com" in url:
            detected_infra.add(("Heroku", "cloud_provider"))

    for infra, i_type in detected_infra:
        i_id = f"infra_{infra}"
        add_node(i_id, infra, i_type, "medium", 12)
        add_link(root_domain, i_id)

    # 8. Risk Score Node
    rs_node_id = "risk_score_node"
    add_node(rs_node_id, f"Risk: {overall_score}", "risk_score", overall_risk, 15)
    add_link(root_domain, rs_node_id)

    return {"nodes": nodes, "links": links}
