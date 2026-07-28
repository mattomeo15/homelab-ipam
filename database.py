"""
IP Freely - Async Database Layer
SQLAlchemy 2.0 (Async ORM) + SQLite PRAGMA WAL Setup
"""

import ipaddress
import os
from datetime import datetime, timezone
from typing import List, Optional, Sequence

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    event,
    select,
)
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
    selectinload,
)

# Default Database Path & Connection String
DB_PATH = os.getenv("DATABASE_PATH", "/data/ip_freely.db")
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{DB_PATH}")


# Base Declarative Class
class Base(DeclarativeBase):
    pass


# -----------------------------------------------------------------------------
# 1. DATA SCHEMA MODELS
# -----------------------------------------------------------------------------

class Device(Base):
    """
    Device Model representing a Primary Host / Layer 3 network entity.
    """
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ip_address: Mapped[str] = mapped_column(String(45), unique=True, index=True, nullable=False)
    mac_address: Mapped[Optional[str]] = mapped_column(String(17), index=True, nullable=True)
    mac_vendor: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    primary_hostname: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    custom_alias: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    subnet_tag: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, default="Unassigned")
    is_online: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    first_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    last_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Cascade Rule: Deleting a device deletes all associated services
    services: Mapped[List["Service"]] = relationship(
        "Service",
        back_populates="device",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    @hybrid_property
    def display_name(self) -> str:
        """
        Computed display name with fallback order:
        custom_alias -> primary_hostname -> fallback generic string (IP-based name).
        """
        if self.custom_alias and self.custom_alias.strip():
            return self.custom_alias.strip()
        if self.primary_hostname and self.primary_hostname.strip():
            return self.primary_hostname.strip()
        return f"Host {self.ip_address}"


class Service(Base):
    """
    Service Model representing open ports, apps, or services discovered on a device host.
    """
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    port: Mapped[int] = mapped_column(Integer, nullable=False)
    protocol: Mapped[str] = mapped_column(String(10), default="TCP", nullable=False)
    service_name: Mapped[str] = mapped_column(String(255), nullable=False)
    discovery_source: Mapped[str] = mapped_column(String(100), default="PortScan", nullable=False)
    url_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    last_verified: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    device: Mapped["Device"] = relationship("Device", back_populates="services")


class SubnetRule(Base):
    """
    SubnetRule Model for custom IP range categorization and UI styling.
    """
    __tablename__ = "subnet_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    ip_start: Mapped[str] = mapped_column(String(45), nullable=False)
    ip_end: Mapped[str] = mapped_column(String(45), nullable=False)
    color_tag: Mapped[str] = mapped_column(String(50), default="#3b82f6", nullable=False)


# -----------------------------------------------------------------------------
# 2. DATABASE ENGINE & SESSION SETUP WITH HIGH-PERFORMANCE PRAGMAS
# -----------------------------------------------------------------------------

def create_db_engine(db_url: str = DATABASE_URL) -> AsyncEngine:
    """
    Creates an Async SQLAlchemy Engine configured with high-performance SQLite PRAGMAs.
    """
    # Ensure directory exists if using SQLite file path
    if db_url.startswith("sqlite+aiosqlite:///"):
        path = db_url.replace("sqlite+aiosqlite:///", "")
        if path and path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)

    engine = create_async_engine(db_url, echo=False, future=True)

    # Enable SQLite WAL mode and foreign key enforcement on connect
    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragmas(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.close()

    return engine


async def init_db(engine: AsyncEngine) -> None:
    """
    Initializes database tables asynchronously.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


def get_async_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """
    Returns an async session factory.
    """
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# -----------------------------------------------------------------------------
# 3. HELPER UTILITIES & NETWORK DISCOVERY METHODS
# -----------------------------------------------------------------------------

async def auto_assign_subnet_tag(session: AsyncSession, ip_address: str) -> Optional[str]:
    """
    Matches an IPv4 address against defined SubnetRule ranges and returns the rule name if matched.
    """
    try:
        target_ip = ipaddress.IPv4Address(ip_address)
    except ValueError:
        return "Unassigned"

    result = await session.execute(select(SubnetRule))
    rules = result.scalars().all()

    for rule in rules:
        try:
            start_ip = ipaddress.IPv4Address(rule.ip_start)
            end_ip = ipaddress.IPv4Address(rule.ip_end)
            if start_ip <= target_ip <= end_ip:
                return rule.name
        except ValueError:
            continue

    return "Unassigned"


async def upsert_device(
    session: AsyncSession,
    ip_address: str,
    mac_address: Optional[str] = None,
    mac_vendor: Optional[str] = None,
    primary_hostname: Optional[str] = None,
    custom_alias: Optional[str] = None,
    is_online: bool = True,
    subnet_tag: Optional[str] = None,
) -> Device:
    """
    Upsert logic for network discovery:
    Given an IP and MAC, updates the existing record (by MAC or IP) or creates a new one,
    preserving `first_seen` while updating `last_seen`.
    """
    device: Optional[Device] = None

    # 1. Lookup by MAC address if present (handles dynamic IP changes)
    if mac_address and mac_address.strip():
        mac_clean = mac_address.strip().lower()
        stmt = select(Device).where(Device.mac_address == mac_clean)
        res = await session.execute(stmt)
        device = res.scalar_one_or_none()

    # 2. Fallback lookup by IP address
    if device is None:
        stmt = select(Device).where(Device.ip_address == ip_address)
        res = await session.execute(stmt)
        device = res.scalar_one_or_none()

    now_utc = datetime.now(timezone.utc)

    # Determine automatic subnet tag if not explicitly provided
    if not subnet_tag or subnet_tag == "Unassigned":
        calculated_tag = await auto_assign_subnet_tag(session, ip_address)
        if calculated_tag and calculated_tag != "Unassigned":
            subnet_tag = calculated_tag

    if device:
        # Update existing record
        device.ip_address = ip_address
        if mac_address:
            device.mac_address = mac_address.strip().lower()
        if mac_vendor:
            device.mac_vendor = mac_vendor
        if primary_hostname:
            device.primary_hostname = primary_hostname
        if custom_alias:
            device.custom_alias = custom_alias
        if subnet_tag and (device.subnet_tag is None or device.subnet_tag == "Unassigned"):
            device.subnet_tag = subnet_tag

        device.is_online = is_online
        device.last_seen = now_utc
    else:
        # Create new record
        device = Device(
            ip_address=ip_address,
            mac_address=mac_address.strip().lower() if mac_address else None,
            mac_vendor=mac_vendor,
            primary_hostname=primary_hostname,
            custom_alias=custom_alias,
            subnet_tag=subnet_tag or "Unassigned",
            is_online=is_online,
            first_seen=now_utc,
            last_seen=now_utc,
        )
        session.add(device)

    await session.commit()
    await session.refresh(device)
    return device


async def get_online_devices_with_services(session: AsyncSession) -> Sequence[Device]:
    """
    Retrieves all online devices along with their child Service records
    in a single efficient async query using selectinload.
    """
    stmt = (
        select(Device)
        .where(Device.is_online == True)
        .options(selectinload(Device.services))
        .order_by(Device.ip_address)
    )
    result = await session.execute(stmt)
    return result.scalars().all()
